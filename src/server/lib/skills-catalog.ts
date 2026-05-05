import path from 'path';
import os from 'os';
import fs from 'fs';
import { SkillDefinition } from '../../types';

const DATA_DIR = path.join(os.homedir(), '.aicorp');
const CACHE_FILE = path.join(DATA_DIR, 'skills-cache.json');
const CUSTOM_SKILLS_FILE = path.join(DATA_DIR, 'custom-skills.json');

const CATALOG_URL = 'https://raw.githubusercontent.com/VoltAgent/awesome-agent-skills/main/README.md';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let cachedCatalog: { skills: SkillDefinition[]; updatedAt: string } | null = null;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getCacheFilePath(): string | null {
  if (fs.existsSync(CACHE_FILE)) return CACHE_FILE;
  return null;
}

function loadFromCache(): { skills: SkillDefinition[]; updatedAt: string } | null {
  try {
    const filePath = getCacheFilePath();
    if (!filePath) return null;

    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);

    if (!data.skills || !Array.isArray(data.skills) || !data.updatedAt) return null;

    const age = Date.now() - new Date(data.updatedAt).getTime();
    if (age > CACHE_TTL_MS) return null;

    return data;
  } catch {
    return null;
  }
}

function saveToCache(data: { skills: SkillDefinition[]; updatedAt: string }) {
  try {
    ensureDir();
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('[SkillsCatalog] Failed to save cache:', err);
  }
}

function parseCatalog(markdown: string): SkillDefinition[] {
  const skills: SkillDefinition[] = [];
  const lines = markdown.split('\n');

  let currentCategory = 'Other';

  const categoryRegex = /^###\s+Skills by (.+)/i;
  const officialCategoryRegex = /^###\s+Official (.+)\s+Skills/i;
  const securityCategoryRegex = /^###\s+Security Skills by (.+)/i;
  const h3Regex = /<h3[^>]*>([^<]+)<\/h3>/i;
  const skillRegex = /^-\s+\*\*\[(.+?)\]\((.+?)\)\*\*\s+\-\s+(.+)$/;

  let inDetailsBlock = false;

  for (const line of lines) {
    if (line.includes('<details')) {
      inDetailsBlock = true;
    }
    if (line.includes('</details>')) {
      inDetailsBlock = false;
    }

    const catMatch = line.match(categoryRegex)
      || line.match(officialCategoryRegex)
      || line.match(securityCategoryRegex)
      || line.match(h3Regex);

    if (catMatch) {
      currentCategory = catMatch[1].trim();
      continue;
    }

    const skillMatch = line.match(skillRegex);
    if (skillMatch) {
      const [, fullName, url, description] = skillMatch;
      const slashIndex = fullName.indexOf('/');
      const org = fullName.substring(0, slashIndex);
      const name = fullName.substring(slashIndex + 1);

      skills.push({
        id: fullName,
        org,
        name,
        url: url.trim(),
        description: description.trim(),
        category: currentCategory,
        skillMdUrl: `https://raw.githubusercontent.com/${org}/skills/main/skills/${name}/SKILL.md`,
      });
    }
  }

  return skills;
}

export async function fetchSkillsCatalog(forceRefresh = false): Promise<{
  skills: SkillDefinition[];
  updatedAt: string;
  source: string;
}> {
  let catalogSkills: SkillDefinition[] = [];

  if (!forceRefresh && cachedCatalog) {
    catalogSkills = cachedCatalog.skills;
  } else if (!forceRefresh) {
    const cached = loadFromCache();
    if (cached) {
      cachedCatalog = cached;
      catalogSkills = cached.skills;
    }
  }

  if (catalogSkills.length === 0) {
    try {
      const response = await fetch(CATALOG_URL);
      if (!response.ok) {
        throw new Error(`Failed to fetch catalog: ${response.status}`);
      }

      const markdown = await response.text();
      catalogSkills = parseCatalog(markdown);

      const result = {
        skills: catalogSkills,
        updatedAt: new Date().toISOString(),
      };

      cachedCatalog = result;
      saveToCache(result);
    } catch (err) {
      console.error('[SkillsCatalog] Fetch failed, trying cache:', err);

      const cached = loadFromCache();
      if (cached) {
        cachedCatalog = cached;
        catalogSkills = cached.skills;
      } else {
        throw err;
      }
    }
  }

  const customSkills = getCustomSkills();
  const allSkills = [...customSkills, ...catalogSkills];

  return {
    skills: allSkills,
    updatedAt: cachedCatalog?.updatedAt || new Date().toISOString(),
    source: CATALOG_URL,
  };
}

export function invalidateCache() {
  cachedCatalog = null;
}

function loadCustomSkillsRaw(): SkillDefinition[] {
  try {
    if (!fs.existsSync(CUSTOM_SKILLS_FILE)) return [];
    const raw = fs.readFileSync(CUSTOM_SKILLS_FILE, 'utf-8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveCustomSkillsRaw(skills: SkillDefinition[]) {
  try {
    ensureDir();
    fs.writeFileSync(CUSTOM_SKILLS_FILE, JSON.stringify(skills, null, 2), 'utf-8');
  } catch (err) {
    console.error('[SkillsCatalog] Failed to save custom skills:', err);
  }
}

export function getCustomSkills(): SkillDefinition[] {
  return loadCustomSkillsRaw();
}

export function addCustomSkill(name: string, description: string): SkillDefinition {
  const skills = loadCustomSkillsRaw();
  const id = `custom/${crypto.randomUUID()}`;
  const skill: SkillDefinition = {
    id,
    org: 'custom',
    name,
    url: '',
    description,
    category: 'Custom',
    skillMdUrl: '',
  };
  skills.push(skill);
  saveCustomSkillsRaw(skills);
  return skill;
}

export function deleteCustomSkill(id: string): boolean {
  const skills = loadCustomSkillsRaw();
  const idx = skills.findIndex(s => s.id === id);
  if (idx === -1) return false;
  skills.splice(idx, 1);
  saveCustomSkillsRaw(skills);
  return true;
}
