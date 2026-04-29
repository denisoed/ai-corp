import fs from 'fs';
import path from 'path';
import os from 'os';
import type { AppSettings } from '../../types';

const DATA_DIR = path.join(os.homedir(), '.aicorp');
const SETTINGS_FILE = path.join(DATA_DIR, 'app-settings.json');

let settings: AppSettings = {};

function migrate(raw: Record<string, unknown>): AppSettings {
  const engines: string[] | undefined = Array.isArray(raw.searchEngines)
    ? raw.searchEngines as string[]
    : (typeof raw.searchBackend === 'string' && raw.searchBackend !== 'auto'
      ? [raw.searchBackend as string]
      : undefined);

  return {
    braveApiKey: typeof raw.braveApiKey === 'string' ? raw.braveApiKey : undefined,
    searchEngines: engines,
    searxngUrl: typeof raw.searxngUrl === 'string' ? raw.searxngUrl : undefined,
    envVars: raw.envVars && typeof raw.envVars === 'object' ? raw.envVars as Record<string, string> : undefined,
  };
}

function readRawFile(): Record<string, unknown> | null {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('[Settings] Failed to read app-settings.json:', e);
  }
  return null;
}

function writeSettingsFile(): void {
  try {
    fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
    const cleaned = { ...settings };
    delete (cleaned as any).searchBackend;
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(cleaned, null, 2));
  } catch (e) {
    console.error('[Settings] Failed to write app-settings.json:', e);
  }
}

export function loadSettings(): AppSettings {
  const raw = readRawFile();
  settings = raw ? migrate(raw) : {};
  return settings;
}

export function getSettings(): Readonly<AppSettings> {
  const raw = readRawFile();
  if (raw) {
    return migrate(raw);
  }
  return settings;
}

export function updateSettings(partial: Partial<AppSettings>): AppSettings {
  Object.assign(settings, partial);
  writeSettingsFile();
  return { ...settings };
}
