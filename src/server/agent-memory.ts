import fs from 'fs';
import path from 'path';
import os from 'os';
import { Agent, Workspace, AgentMemory, MemoryMessage } from '../types';
import { summarizeAgentMemory } from './opencode';

const AICORP_DIR = path.join(os.homedir(), '.aicorp');
const AGENTS_DIR = path.join(AICORP_DIR, 'agents');

const MAX_RECENT_MESSAGES = 30;
const SUMMARIZE_THRESHOLD = 30;
const KEEP_AFTER_SUMMARIZE = 5;

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

export function initMemorySystem(): void {
  ensureDir(AICORP_DIR);
  ensureDir(AGENTS_DIR);
  console.log(`[Memory] System initialized at ${AICORP_DIR}`);
}

export function getAgentDir(agentId: string): string {
  return path.join(AGENTS_DIR, agentId);
}

function memoryJsonPath(agentId: string): string {
  return path.join(getAgentDir(agentId), 'memory.json');
}

function memoryMdPath(agentId: string): string {
  return path.join(getAgentDir(agentId), 'memory.md');
}

function sessionFile(agentId: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(getAgentDir(agentId), 'sessions', `${date}.jsonl`);
}

export function createMemory(agent: Agent, workspace?: Workspace): AgentMemory {
  const now = new Date().toISOString();

  const memory: AgentMemory = {
    agentId: agent.id,
    agentName: agent.name,
    workspaceId: workspace?.id,
    workspaceName: workspace?.name,
    workspaceFolder: workspace?.folderPath,
    summary: `Agent "${agent.name}" (${agent.role}) created.${workspace ? ` Workspace: ${workspace.name}.` : ''}`,
    keyFacts: [
      `Role: ${agent.role}`,
      `Model: ${agent.model}`,
      `Skills: ${agent.skills.join(', ')}`,
      ...(workspace ? [`Workspace: ${workspace.name}${workspace.folderPath ? ` (${workspace.folderPath})` : ''}`] : []),
    ],
    activeTasks: [],
    recentMessages: [],
    totalMessages: 0,
    totalSessions: 0,
    createdAt: now,
  };

  const dir = getAgentDir(agent.id);
  ensureDir(dir);
  ensureDir(path.join(dir, 'sessions'));

  saveMemory(memory);
  return memory;
}

export function loadMemory(agentId: string): AgentMemory | null {
  const file = memoryJsonPath(agentId);
  try {
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error(`[Memory] Failed to load memory for agent ${agentId}:`, e);
  }
  return null;
}

export function saveMemory(memory: AgentMemory): void {
  const dir = getAgentDir(memory.agentId);
  ensureDir(dir);
  ensureDir(path.join(dir, 'sessions'));

  try {
    fs.writeFileSync(memoryJsonPath(memory.agentId), JSON.stringify(memory, null, 2));
    writeMemoryMd(memory);
  } catch (e) {
    console.error(`[Memory] Failed to save memory for agent ${memory.agentId}:`, e);
  }
}

function writeMemoryMd(memory: AgentMemory): void {
  const lines: string[] = [];

  lines.push(`# Agent Memory: ${memory.agentName}`);
  if (memory.workspaceName) {
    lines.push(`Workspace: ${memory.workspaceName}${memory.workspaceFolder ? ` (${memory.workspaceFolder})` : ''}`);
  }
  lines.push('');
  lines.push('## Summary');
  lines.push(memory.summary || '(empty)');
  lines.push('');

  if (memory.keyFacts.length > 0) {
    lines.push('## Key Facts');
    for (const fact of memory.keyFacts) {
      lines.push(`- ${fact}`);
    }
    lines.push('');
  }

  if (memory.activeTasks.length > 0) {
    lines.push('## Active Tasks');
    for (const task of memory.activeTasks) {
      lines.push(`- ${task.title} — ${task.status}`);
    }
    lines.push('');
  }

  if (memory.recentMessages.length > 0) {
    lines.push('## Recent Context');
    for (const msg of memory.recentMessages) {
      const short = msg.timestamp.slice(11, 16);
      const source = msg.source ? ` [${msg.source}]` : '';
      lines.push(`[${short} ${msg.role}${source}] ${msg.content}`);
    }
    lines.push('');
  }

  try {
    fs.writeFileSync(memoryMdPath(memory.agentId), lines.join('\n'));
  } catch (e) {
    console.error(`[Memory] Failed to write memory.md for agent ${memory.agentId}:`, e);
  }
}

export function getMemoryContext(agentId: string): string {
  const file = memoryMdPath(agentId);
  try {
    if (fs.existsSync(file)) {
      return fs.readFileSync(file, 'utf8');
    }
  } catch (e) {
    console.error(`[Memory] Failed to read memory.md for agent ${agentId}:`, e);
  }
  return '';
}

export async function appendMessage(
  agentId: string,
  message: Omit<MemoryMessage, 'timestamp'>,
  summarizeFn?: (memory: AgentMemory) => Promise<AgentMemory>
): Promise<void> {
  const memory = loadMemory(agentId);
  if (!memory) return;

  const fullMessage: MemoryMessage = {
    ...message,
    timestamp: new Date().toISOString(),
  };

  memory.recentMessages.push(fullMessage);
  memory.totalMessages++;

  // Append to session log
  try {
    ensureDir(path.dirname(sessionFile(agentId)));
    fs.appendFileSync(sessionFile(agentId), JSON.stringify(fullMessage) + '\n');
  } catch (e) {
    console.error(`[Memory] Failed to append to session log for agent ${agentId}:`, e);
  }

  // Trim buffer if it exceeds max
  while (memory.recentMessages.length > MAX_RECENT_MESSAGES) {
    memory.recentMessages.shift();
  }

  saveMemory(memory);

  // Trigger summarization if buffer exceeds threshold
  if (memory.recentMessages.length >= SUMMARIZE_THRESHOLD) {
    const fn = summarizeFn || summarizeAgentMemory;
    await maybeSummarize(agentId, fn);
  }
}

export async function maybeSummarize(
  agentId: string,
  summarizeFn: (memory: AgentMemory) => Promise<AgentMemory>
): Promise<AgentMemory | null> {
  const memory = loadMemory(agentId);
  if (!memory) return null;
  if (memory.recentMessages.length < SUMMARIZE_THRESHOLD) return memory;

  try {
    const summarized = await summarizeFn(memory);
    if (summarized) {
      saveMemory(summarized);
      return summarized;
    }
  } catch (e) {
    console.error(`[Memory] Summarization failed for agent ${agentId}:`, e);
  }

  return memory;
}

export function clearMemory(agentId: string): void {
  const dir = getAgentDir(agentId);
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(`[Memory] Cleared memory for agent ${agentId}`);
    }
  } catch (e) {
    console.error(`[Memory] Failed to clear memory for agent ${agentId}:`, e);
  }
}

export function updateAgentInfo(agentId: string, agent: Agent, workspace?: Workspace): void {
  const memory = loadMemory(agentId);
  if (!memory) return;

  memory.agentName = agent.name;
  memory.workspaceId = workspace?.id;
  memory.workspaceName = workspace?.name;
  memory.workspaceFolder = workspace?.folderPath;

  if (workspace && !memory.keyFacts.some(f => f.startsWith('Workspace:'))) {
    memory.keyFacts.push(`Workspace: ${workspace.name}${workspace.folderPath ? ` (${workspace.folderPath})` : ''}`);
  }

  saveMemory(memory);
}

export function updateWorkspaceInfo(agentId: string, workspace?: Workspace): void {
  const memory = loadMemory(agentId);
  if (!memory) return;

  memory.workspaceId = workspace?.id;
  memory.workspaceName = workspace?.name;
  memory.workspaceFolder = workspace?.folderPath;

  saveMemory(memory);
}
