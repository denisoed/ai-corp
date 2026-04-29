import { execSync, spawn } from 'child_process';
import { getSettings, updateSettings } from './settings';

const CONTAINER_NAME = 'aicorp-searxng';
const SEARXNG_PORT = 8080;
const HEALTH_TIMEOUT_MS = 30000;
const HEALTH_POLL_MS = 1000;

export interface SearXngLaunchResult {
  url: string;
  status: 'running' | 'launched' | 'error';
  message: string;
}

function checkDockerAvailable(): boolean {
  try {
    execSync('docker info', { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function containerExists(): boolean {
  try {
    execSync(`docker inspect ${CONTAINER_NAME}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function containerRunning(): boolean {
  try {
    const out = execSync(`docker inspect -f '{{.State.Running}}' ${CONTAINER_NAME}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.trim() === 'true';
  } catch {
    return false;
  }
}

async function waitForHealth(url: string, timeoutMs: number = HEALTH_TIMEOUT_MS): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) return true;
    } catch {
      // still starting
    }
    await new Promise(r => setTimeout(r, HEALTH_POLL_MS));
  }
  return false;
}

export async function launchSearXng(): Promise<SearXngLaunchResult> {
  if (!checkDockerAvailable()) {
    return {
      url: '',
      status: 'error',
      message: 'Docker is not available. Install Docker Desktop from https://docker.com',
    };
  }

  const existingUrl = getSettings().searxngUrl || `http://localhost:${SEARXNG_PORT}`;

  if (containerRunning()) {
    console.log('[SearXNG] Container already running');
    return {
      url: existingUrl,
      status: 'running',
      message: 'SearXNG is already running',
    };
  }

  try {
    if (containerExists()) {
      console.log('[SearXNG] Starting existing container...');
      execSync(`docker start ${CONTAINER_NAME}`, { stdio: 'ignore', timeout: 10000 });
    } else {
      console.log('[SearXNG] Pulling and creating container...');
      execSync(
        `docker run -d --name ${CONTAINER_NAME} -p ${SEARXNG_PORT}:8080 searxng/searxng`,
        { stdio: 'ignore', timeout: 60000 },
      );
    }

    const healthy = await waitForHealth(existingUrl);
    if (!healthy) {
      return {
        url: existingUrl,
        status: 'error',
        message: 'SearXNG started but health check timed out. It may still be initializing.',
      };
    }

    if (!getSettings().searxngUrl) {
      updateSettings({ searxngUrl: existingUrl });
    }

    console.log(`[SearXNG] Ready at ${existingUrl}`);
    return {
      url: existingUrl,
      status: 'launched',
      message: 'SearXNG is running and healthy',
    };
  } catch (e: any) {
    console.error('[SearXNG] Launch failed:', e.message);
    return {
      url: existingUrl,
      status: 'error',
      message: `Failed to launch SearXNG: ${e.message}`,
    };
  }
}

export async function checkSearXngStatus(): Promise<{ running: boolean; url: string }> {
  const url = getSettings().searxngUrl || `http://localhost:${SEARXNG_PORT}`;
  try {
    const res = await fetch(`${url}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return { running: res.ok, url };
  } catch {
    return { running: false, url };
  }
}
