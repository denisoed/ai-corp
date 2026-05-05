import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { CronJob as CronJobType } from '../types';
import { getStore, mutateStore } from './store';
import { createChatSession } from './llm';
import { loadMemory, buildSystemPrompt, appendMessage } from './agent-memory';
import { executeTool } from './tools/index';

const AICORP_DIR = path.join(os.homedir(), '.aicorp');
const WORKSPACES_DIR = path.join(AICORP_DIR, 'workspaces');

const scheduledTasks = new Map<string, ScheduledTask>();
const cronJobs = new Map<string, CronJobType>();

function cronFilePath(workspaceSlug: string): string {
  return path.join(WORKSPACES_DIR, workspaceSlug, 'crons.json');
}

function loadCronsForWorkspace(slug: string): CronJobType[] {
  const file = cronFilePath(slug);
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (e) {
    console.error(`[Cron] Failed to load crons for workspace ${slug}:`, e);
  }
  return [];
}

function saveCronsForWorkspace(slug: string, jobs: CronJobType[]): void {
  const file = cronFilePath(slug);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(jobs, null, 2));
  } catch (e) {
    console.error(`[Cron] Failed to save crons for workspace ${slug}:`, e);
  }
}

function scheduleJob(job: CronJobType): void {
  if (!job.enabled) return;

  stopJob(job.id);

  try {
    const task = cron.schedule(job.schedule, () => {
      executeCronJob(job.id);
    }, { name: job.id });
    scheduledTasks.set(job.id, task);
    console.log(`[Cron] Scheduled "${job.name}" (${job.schedule}) for agent ${job.agentId}`);
  } catch (e: any) {
    console.error(`[Cron] Failed to schedule "${job.name}": ${e.message}`);
  }
}

function stopJob(jobId: string): void {
  const task = scheduledTasks.get(jobId);
  if (task) {
    task.stop();
    task.destroy();
    scheduledTasks.delete(jobId);
  }
}

export function initCronManager(): void {
  try {
    if (!fs.existsSync(WORKSPACES_DIR)) return;

    const entries = fs.readdirSync(WORKSPACES_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const jobs = loadCronsForWorkspace(entry.name);
      for (const job of jobs) {
        cronJobs.set(job.id, job);
        scheduleJob(job);
      }
    }
    console.log(`[Cron] Initialized with ${cronJobs.size} jobs`);
  } catch (e) {
    console.error('[Cron] Failed to initialize:', e);
  }
}

export function createCronJob(data: Omit<CronJobType, 'id' | 'createdAt'>): CronJobType {
  const now = new Date().toISOString();
  const job: CronJobType = {
    ...data,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };

  const store = getStore();
  const ws = store.workspaces.find(w => w.id === job.workspaceId);
  const slug = ws?.slug || 'orphans';

  const existing = loadCronsForWorkspace(slug);
  existing.push(job);
  saveCronsForWorkspace(slug, existing);

  cronJobs.set(job.id, job);
  scheduleJob(job);

  mutateStore(s => {
    s.logs.unshift({
      id: crypto.randomUUID(),
      timestamp: now,
      agentId: job.agentId,
      action: 'Cron Job Created',
      details: `Cron "${job.name}" created with schedule "${job.schedule}"`,
      type: 'info',
      source: 'cron',
      category: 'cron',
      workspaceId: job.workspaceId,
      metadata: { cronId: job.id, cronName: job.name, schedule: job.schedule, prompt: job.prompt },
    });
    if (s.logs.length > 100) s.logs = s.logs.slice(0, 100);
  });

  return job;
}

export function updateCronJob(id: string, updates: Partial<Pick<CronJobType, 'schedule' | 'prompt' | 'enabled' | 'name' | 'description'>>): CronJobType | null {
  const job = cronJobs.get(id);
  if (!job) return null;

  Object.assign(job, updates, { updatedAt: new Date().toISOString() });

  const store = getStore();
  const ws = store.workspaces.find(w => w.id === job.workspaceId);
  const slug = ws?.slug || 'orphans';
  const all = loadCronsForWorkspace(slug);
  const idx = all.findIndex(j => j.id === id);
  if (idx !== -1) all[idx] = job;
  saveCronsForWorkspace(slug, all);

  cronJobs.set(id, job);
  scheduleJob(job);

  mutateStore(s => {
    s.logs.unshift({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      agentId: job.agentId,
      action: 'Cron Job Updated',
      details: `Cron "${job.name}" updated`,
      type: 'info',
      source: 'cron',
      category: 'cron',
      workspaceId: job.workspaceId,
      metadata: { cronId: job.id, cronName: job.name },
    });
    if (s.logs.length > 100) s.logs = s.logs.slice(0, 100);
  });

  return job;
}

export function deleteCronJob(id: string): boolean {
  const job = cronJobs.get(id);
  if (!job) return false;

  stopJob(id);
  cronJobs.delete(id);

  const store = getStore();
  const ws = store.workspaces.find(w => w.id === job.workspaceId);
  const slug = ws?.slug || 'orphans';
  const all = loadCronsForWorkspace(slug).filter(j => j.id !== id);
  saveCronsForWorkspace(slug, all);

  mutateStore(s => {
    s.logs.unshift({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      agentId: job.agentId,
      action: 'Cron Job Deleted',
      details: `Cron "${job.name}" deleted`,
      type: 'warning',
      source: 'cron',
      category: 'cron',
      workspaceId: job.workspaceId,
      metadata: { cronId: job.id, cronName: job.name },
    });
    if (s.logs.length > 100) s.logs = s.logs.slice(0, 100);
  });

  return true;
}

export function listCronJobs(workspaceId?: string): CronJobType[] {
  const all = Array.from(cronJobs.values());
  if (workspaceId) {
    return all.filter(j => j.workspaceId === workspaceId);
  }
  return all;
}

export function getCronJob(id: string): CronJobType | undefined {
  return cronJobs.get(id);
}

export async function runCronNow(id: string): Promise<{ success: boolean; error?: string }> {
  const job = cronJobs.get(id);
  if (!job) return { success: false, error: 'Cron job not found' };
  if (job.lastStatus === 'running') return { success: false, error: 'Cron job is already running' };

  try {
    await executeCronJob(id);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

async function executeCronJob(jobId: string): Promise<void> {
  const job = cronJobs.get(jobId);
  if (!job) return;

  const store = getStore();
  const agent = store.agents.find(a => a.id === job.agentId);
  if (!agent) {
    console.error(`[Cron] Agent ${job.agentId} not found for cron "${job.name}", disabling`);
    updateCronJob(jobId, { enabled: false });
    return;
  }

  job.lastStatus = 'running';
  job.lastRunAt = new Date().toISOString();
  cronJobs.set(jobId, job);

  mutateStore(s => {
    const a = s.agents.find(x => x.id === agent.id);
    if (a) a.status = 'Working';
  });

  try {
    console.log(`[Cron] Firing — "${job.name}" for agent ${agent.name} (schedule: ${job.schedule}, prompt: "${job.prompt.slice(0, 100)}")`);

    const memory = loadMemory(agent.id);
    let systemInstruction = buildSystemPrompt(agent);

    if (agent.telegramConfig?.botToken) {
      const chatId = agent.telegramConfig.lastChatId;
      const chatInfo = chatId
        ? `Last known Telegram chat ID: ${chatId}.`
        : 'No known chat ID yet — the user must message the bot first.';
      systemInstruction += `\n\n# TELEGRAM NOTIFICATION CAPABILITY\nYou have a Telegram bot configured. You can send direct messages to Telegram users using the send_telegram_message tool.\n${chatInfo}\nUse send_telegram_message(message) to notify the user of cron job results, reports, or important updates.\n\nWhen the cron prompt asks you to "send" or "notify" someone — use send_telegram_message to deliver directly to their Telegram chat.`;
    }

    const promptWithContext = job.prompt;

    const chatSession = createChatSession(agent, systemInstruction);
    let response = await chatSession.sendMessage(promptWithContext);
    let replyText = response.text;

    while (response.toolCalls && response.toolCalls.length > 0) {
      const results = [];
      for (const call of response.toolCalls) {
        let args: any;
        try {
          args = JSON.parse(call.function.arguments);
        } catch {
          results.push({ success: false, error: 'Invalid arguments' });
          continue;
        }

        const result = await executeTool(call.function.name, args, agent.id);
        results.push(result);
      }
      response = await chatSession.sendToolResults(response.toolCalls, results);
      if (response.text) {
        replyText = response.text;
      }
    }

    const finalReply = replyText.trim() || 'Cron job executed.';

    if (memory) {
      await appendMessage(agent.id, { role: 'user', content: `[CRON: ${job.name}] ${job.prompt}`, source: 'system' });
      await appendMessage(agent.id, { role: 'assistant', content: finalReply, source: 'system' });
    }

    job.lastStatus = 'success';
    job.lastResult = finalReply.slice(0, 1000);

    console.log(`[Cron] Completed — "${job.name}" status: success, result: ${finalReply.slice(0, 150)}`);

    mutateStore(s => {
      s.logs.unshift({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        agentId: agent.id,
        action: 'Cron Job Executed',
        details: `Cron "${job.name}" completed: ${finalReply.slice(0, 200)}`,
        type: 'success',
        source: 'cron',
        category: 'cron',
        workspaceId: job.workspaceId,
        metadata: { cronId: job.id, cronName: job.name, schedule: job.schedule, prompt: job.prompt, result: finalReply.slice(0, 1000) },
      });
      if (s.logs.length > 100) s.logs = s.logs.slice(0, 100);
    });
  } catch (e: any) {
    console.error(`[Cron] Failed — "${job.name}": ${e.message}`);
    job.lastStatus = 'error';
    job.lastResult = `Error: ${e.message}`;

    mutateStore(s => {
      s.logs.unshift({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        agentId: agent.id,
        action: 'Cron Job Failed',
        details: `Cron "${job.name}" failed: ${e.message}`,
        type: 'error',
        source: 'cron',
        category: 'cron',
        workspaceId: job.workspaceId,
        metadata: { cronId: job.id, cronName: job.name, schedule: job.schedule, prompt: job.prompt, result: e.message },
      });
      if (s.logs.length > 100) s.logs = s.logs.slice(0, 100);
    });
  } finally {
    cronJobs.set(jobId, job);

    const store = getStore();
    const ws = store.workspaces.find(w => w.id === job.workspaceId);
    const slug = ws?.slug || 'orphans';
    const all = loadCronsForWorkspace(slug);
    const idx = all.findIndex(j => j.id === jobId);
    if (idx !== -1) all[idx] = job;
    saveCronsForWorkspace(slug, all);

    mutateStore(s => {
      const a = s.agents.find(x => x.id === agent.id);
      if (a && a.status === 'Working') a.status = 'Idle';
    });
  }
}
