import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

const DATA_DIR = path.join(os.homedir(), '.aicorp');
const KEY_FILE = path.join(DATA_DIR, 'encryption.key');
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

let encryptionKey: Buffer | null = null;

export function getOrCreateKey(): Buffer {
  if (encryptionKey) {
    return encryptionKey;
  }

  try {
    if (fs.existsSync(KEY_FILE)) {
      encryptionKey = fs.readFileSync(KEY_FILE);
      return encryptionKey;
    }
  } catch (e) {
    console.error('[Encryption] Failed to read key file:', e);
  }

  const newKey = crypto.randomBytes(KEY_LENGTH);

  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(KEY_FILE, newKey, { mode: 0o600 });
    console.log('[Encryption] Generated new encryption key');
  } catch (e) {
    console.error('[Encryption] Failed to save key file:', e);
  }

  encryptionKey = newKey;
  return newKey;
}

export function encrypt(plaintext: string): string {
  const key = getOrCreateKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decrypt(encryptedData: string): string {
  const key = getOrCreateKey();

  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

export function isEncrypted(value: string): boolean {
  return value.startsWith('enc:');
}

export function encryptValue(value: string): string {
  return `enc:${encrypt(value)}`;
}

export function decryptValue(value: string): string {
  if (!isEncrypted(value)) {
    return value;
  }
  const encrypted = value.slice(4);
  return decrypt(encrypted);
}