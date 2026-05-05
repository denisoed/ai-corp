import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { getDb, validateToken, saveToken, deleteToken, cleanupExpiredTokens, loadSetting, saveSetting } from './db';

const TOKEN_BYTES = 32;
const TOKEN_VALIDITY_DAYS = 30;
const SALT_LENGTH = 16;
const KEY_LENGTH = 64;
const HASH_ITERATIONS = 100000;
const DIGEST = 'sha256';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(SALT_LENGTH).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, HASH_ITERATIONS, KEY_LENGTH, DIGEST).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const computed = crypto.pbkdf2Sync(password, salt, HASH_ITERATIONS, KEY_LENGTH, DIGEST).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hash));
}

export function getStoredPassword(): string | undefined {
  return loadSetting('auth_password');
}

export function setPassword(password: string): void {
  saveSetting('auth_password', hashPassword(password));
}

export function isPasswordSet(): boolean {
  return Boolean(getStoredPassword());
}

export function generateToken(): string {
  cleanupExpiredTokens();
  const token = crypto.randomBytes(TOKEN_BYTES).toString('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + TOKEN_VALIDITY_DAYS);
  saveToken(token, expiresAt.toISOString());
  return token;
}

export function revokeToken(token: string): void {
  deleteToken(token);
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!isPasswordSet()) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.slice(7);
  if (!validateToken(token)) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  next();
}
