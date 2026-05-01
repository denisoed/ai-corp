import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { promisify } from 'util';
import { execFile as execFileCb } from 'child_process';
import { getStore, mutateStore } from './store';
import { assertAgentInWorkspace } from './workspace-guard';
import { CommandRun, CommandRunResult, TaskRisk, WorkspaceCommandExecutionSettings } from '../types';
import { requestApproval } from './task-autopilot';

const execFile = promisify(execFileCb);
const DEFAULT_IMAGE = 'node:20-bookworm-slim';
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_MEMORY_LIMIT_MB = 4096;
const DEFAULT_CPU_LIMIT = 2;
const DEFAULT_PIDS_LIMIT = 512;
const MAX_OUTPUT_BYTES = 1024 * 1024;

interface CommandPolicyDecision {
  status: 'allow' | 'needs_approval' | 'deny';
  risk: TaskRisk;
  reason?: string;
  network?: boolean;
  destructive?: boolean;
}

export interface RunCommandInput {
  agentId: string;
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  detach?: boolean;
  existingRunId?: string;
}

async function checkDocker(): Promise<{ ok: boolean; message?: string }> {
  try {
    await execFile('docker', ['info'], { timeout: 5000, windowsHide: true });
    return { ok: true };
  } catch (error: any) {
    return { ok: false, message: error?.message || 'Docker is not available.' };
  }
}

function sanitizeContainerName(input: string): string {
  return `aicorp-${input.toLowerCase().replace(/[^a-z0-9_.-]/g, '-')}`.slice(0, 63);
}

function isNetworkCommand(command: string, args: string[]): boolean {
  const text = [command, ...args].join(' ').toLowerCase();
  return /(^|[\s"'])((npm\s+(install|ci|add|update))|(pnpm\s+(add|install|update|dlx))|(yarn\s+(add|install|upgrade|dlx))|(curl|wget|git\s+clone|git\s+fetch|git\s+push|git\s+pull|pip\s+install|bun\s+install|docker\s+pull))([\s"']|$)/.test(text)
    || /\bhttps?:\/\//.test(text)
    || /\bregistry\.npmjs\.org\b/.test(text);
}

function isDestructiveCommand(command: string, args: string[]): boolean {
  const text = [command, ...args].join(' ').toLowerCase();
  return /(^|[\s"'])(rm\s+-rf|rm\s+-fr|mkfs|dd\s+if=|chmod\s+777|chown\s+-r|sudo\s+|shutdown|reboot|poweroff|kill\s+-9|killall|truncate\s+-s\s+0)([\s"']|$)/.test(text)
    || /(^|[\s"'])>\s*[\w./-]+/.test(text);
}

function isGitWriteCommand(command: string, args: string[]): boolean {
  const text = [command, ...args].join(' ').toLowerCase();
  return /\bgit\s+(add|commit|merge|rebase|reset|checkout|switch|push|tag)\b/.test(text);
}

function buildCommandPolicy(command: string, args: string[], settings?: WorkspaceCommandExecutionSettings): CommandPolicyDecision {
  const network = isNetworkCommand(command, args);
  const destructive = isDestructiveCommand(command, args);
  const gitWrite = isGitWriteCommand(command, args);
  const allowNetwork = settings?.allowNetwork ?? false;
  const allowDestructive = settings?.allowDestructiveCommands ?? false;
  const allowGitWrite = settings?.allowGitWrite ?? false;

  if (destructive && !allowDestructive) {
    return { status: 'deny', risk: 'critical', reason: 'Command is destructive and is blocked by workspace policy.', destructive };
  }

  if ((network && !allowNetwork) || (gitWrite && !allowGitWrite)) {
    return {
      status: 'needs_approval',
      risk: network ? 'high' : 'medium',
      reason: network && !allowNetwork
        ? 'Command needs network access and requires approval.'
        : 'Command modifies Git state and requires approval.',
      network,
      destructive
    };
  }

  return {
    status: 'allow',
    risk: destructive ? 'high' : network ? 'medium' : 'low',
    network,
    destructive
  };
}

function getWorkspaceSettings(agentId: string): WorkspaceCommandExecutionSettings {
  const { workspace } = assertAgentInWorkspace(agentId);
  return workspace.settings?.commandExecution || {};
}

function buildDockerRunArgs(containerName: string, workspacePath: string, command: string, args: string[], options: {
  cwd: string;
  env?: Record<string, string>;
  timeoutMs: number;
  detach: boolean;
  image: string;
  cpuLimit: number;
  memoryLimitMb: number;
  pidsLimit: number;
  networkMode: 'none' | 'bridge';
}): string[] {
  const dockerArgs = ['run'];
  if (options.detach) dockerArgs.push('-d');
  else dockerArgs.push('--rm');
  dockerArgs.push('--name', containerName);
  dockerArgs.push('--init');
  dockerArgs.push('--user', '1000:1000');
  dockerArgs.push('--cap-drop', 'ALL');
  dockerArgs.push('--security-opt', 'no-new-privileges:true');
  dockerArgs.push('--pids-limit', String(options.pidsLimit));
  dockerArgs.push('--cpus', String(options.cpuLimit));
  dockerArgs.push('--memory', `${options.memoryLimitMb}m`);
  dockerArgs.push('--network', options.networkMode);
  dockerArgs.push('-v', `${workspacePath}:/workspace`);
  dockerArgs.push('-w', options.cwd);

  for (const [key, value] of Object.entries(options.env || {})) {
    dockerArgs.push('-e', `${key}=${value}`);
  }

  dockerArgs.push(options.image);
  dockerArgs.push(command, ...args);
  return dockerArgs;
}

async function runDetachedDockerCommand(commandArgs: string[]): Promise<{ containerId: string }> {
  const result = await execFile('docker', commandArgs, { windowsHide: true });
  return { containerId: result.stdout.trim() };
}

export async function runCommandInWorkspace(input: RunCommandInput): Promise<CommandRunResult> {
  const docker = await checkDocker();
  if (!docker.ok) {
    return { success: false, status: 'error', reason: docker.message };
  }

  const state = getStore();
  const agent = state.agents.find(a => a.id === input.agentId);
  if (!agent?.workspaceId) {
    return { success: false, status: 'error', reason: 'Agent is not assigned to a workspace.' };
  }

  const workspace = state.workspaces.find(w => w.id === agent.workspaceId);
  if (!workspace?.folderPath) {
    return { success: false, status: 'error', reason: 'Workspace has no folder path configured.' };
  }
  fs.mkdirSync(workspace.folderPath, { recursive: true });
  if (input.existingRunId && !state.commandRuns.find(x => x.id === input.existingRunId)) {
    return { success: false, status: 'error', reason: 'Command run not found.' };
  }

  const settings = getWorkspaceSettings(input.agentId);
  if (settings.enabled === false) {
    return { success: false, status: 'denied', reason: 'Command execution is disabled for this workspace.' };
  }

  const command = input.command.trim();
  const args = input.args || [];
  const cwd = path.posix.normalize((input.cwd || '.').replace(/\\/g, '/'));
  if (cwd.startsWith('..')) {
    return { success: false, status: 'denied', reason: 'cwd must stay inside the workspace.' };
  }

  const policy = buildCommandPolicy(command, args, settings);
  if (policy.status === 'deny') {
    return { success: false, status: 'denied', reason: policy.reason };
  }
  if (input.existingRunId) {
    policy.status = 'allow';
  }

  const workspaceRun: CommandRun = input.existingRunId
    ? state.commandRuns.find(x => x.id === input.existingRunId)!
    : {
        id: crypto.randomUUID(),
        workspaceId: workspace.id,
        agentId: input.agentId,
        command,
        args,
        cwd,
        env: input.env,
        status: policy.status === 'needs_approval' ? 'needs_approval' : 'running',
        startedAt: new Date().toISOString()
      };

  if (!input.existingRunId) {
    mutateStore(s => {
      s.commandRuns.unshift(workspaceRun);
      if (s.commandRuns.length > 100) s.commandRuns = s.commandRuns.slice(0, 100);
    });
  }

  if (policy.status === 'needs_approval') {
    const approvalResult = await requestApproval({
      agentId: input.agentId,
      commandRunId: workspaceRun.id,
      action: `Run command: ${command} ${args.join(' ')}`.trim(),
      risk: policy.risk,
      estimatedCost: 0,
      details: policy.reason || 'Command requires approval before execution.'
    });
    if (!approvalResult.success) {
      mutateStore(s => {
        const run = s.commandRuns.find(x => x.id === workspaceRun.id);
        if (run) {
          run.status = 'failed';
          run.reason = approvalResult.error || policy.reason;
          run.finishedAt = new Date().toISOString();
        }
      });
      return { success: false, status: 'error', reason: approvalResult.error || policy.reason };
    }

    mutateStore(s => {
      const run = s.commandRuns.find(x => x.id === workspaceRun.id);
      if (run) run.approvalRequestId = approvalResult.approvalId;
    });

    return {
      success: false,
      status: 'needs_approval',
      approvalRequestId: approvalResult.approvalId,
      commandRunId: workspaceRun.id,
      reason: policy.reason
    };
  }

  const timeoutMs = input.timeoutMs || settings.timeoutMs || DEFAULT_TIMEOUT_MS;
  const image = settings.dockerImage || DEFAULT_IMAGE;
  const cpuLimit = settings.cpuLimit || DEFAULT_CPU_LIMIT;
  const memoryLimitMb = settings.memoryLimitMb || DEFAULT_MEMORY_LIMIT_MB;
  const pidsLimit = settings.pidsLimit || DEFAULT_PIDS_LIMIT;
  const networkMode = policy.network ? 'bridge' : 'none';
  const containerName = sanitizeContainerName(`${workspace.slug}-${workspaceRun.id}`);

  mutateStore(s => {
    const run = s.commandRuns.find(x => x.id === workspaceRun.id);
    if (run) run.containerName = containerName;
  });

  const dockerArgs = buildDockerRunArgs(
    containerName,
    path.resolve(workspace.folderPath),
    command,
    args,
    {
      cwd: path.posix.join('/workspace', cwd === '.' ? '' : cwd),
      env: {
        ...workspace.settings?.envVars,
        ...input.env
      },
      timeoutMs,
      detach: Boolean(input.detach),
      image,
      cpuLimit,
      memoryLimitMb,
      pidsLimit,
      networkMode
    }
  );

  try {
    let stdout = '';
    let stderr = '';
    if (input.detach) {
      const detached = await runDetachedDockerCommand(dockerArgs);
      mutateStore(s => {
        const run = s.commandRuns.find(x => x.id === workspaceRun.id);
        if (run) {
          run.status = 'running';
          run.containerName = detached.containerId || containerName;
        }
      });
      return {
        success: true,
        status: 'running',
        commandRunId: workspaceRun.id,
        containerName: detached.containerId || containerName,
        durationMs: 0
      };
    }

    const result = await execFile('docker', dockerArgs, {
      timeout: timeoutMs,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true
    });
    stdout = result.stdout?.toString() || '';
    stderr = result.stderr?.toString() || '';
    mutateStore(s => {
      const run = s.commandRuns.find(x => x.id === workspaceRun.id);
      if (run) {
        run.status = 'completed';
        run.exitCode = 0;
        run.stdout = stdout;
        run.stderr = stderr;
        run.finishedAt = new Date().toISOString();
        run.durationMs = Date.now() - Date.parse(run.startedAt);
      }
    });
    return {
      success: true,
      status: 'completed',
      commandRunId: workspaceRun.id,
      exitCode: 0,
      stdout,
      stderr,
      containerName,
      durationMs: Date.now() - Date.parse(workspaceRun.startedAt)
    };
  } catch (error: any) {
    const stdout = error?.stdout?.toString?.() || '';
    const stderr = error?.stderr?.toString?.() || error?.message || 'Command failed';
    const exitCode = typeof error?.code === 'number' ? error.code : 1;
    mutateStore(s => {
      const run = s.commandRuns.find(x => x.id === workspaceRun.id);
      if (run) {
        run.status = error?.name === 'AbortError' || /timed out/i.test(stderr) ? 'failed' : 'error';
        run.exitCode = exitCode;
        run.stdout = stdout;
        run.stderr = stderr;
        run.reason = stderr;
        run.finishedAt = new Date().toISOString();
        run.durationMs = Date.now() - Date.parse(run.startedAt);
      }
    });
    return {
      success: false,
      status: 'failed',
      commandRunId: workspaceRun.id,
      exitCode,
      stdout,
      stderr,
      reason: stderr,
      containerName
    };
  }
}

export async function resumeApprovedCommand(commandRunId: string): Promise<CommandRunResult> {
  const state = getStore();
  const run = state.commandRuns.find(x => x.id === commandRunId);
  if (!run) {
    return { success: false, status: 'error', reason: 'Command run not found.' };
  }
  return runCommandInWorkspace({
    agentId: run.agentId,
    command: run.command,
    args: run.args,
    cwd: run.cwd,
    env: run.env,
    existingRunId: run.id
  });
}
