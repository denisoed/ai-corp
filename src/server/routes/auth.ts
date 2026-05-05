import { Router } from 'express';
import {
  isPasswordSet, setPassword, verifyPassword,
  getStoredPassword, generateToken, revokeToken
} from '../auth';
import { validateToken } from '../db';

const router = Router();

// Get auth status — whether password is required
router.get('/auth/status', (_req, res) => {
  const requiresAuth = isPasswordSet();
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.set('Pragma', 'no-cache');
  res.json({ requiresAuth, setupCompleted: requiresAuth });
});

// Setup initial password (first-time only)
router.post('/auth/setup', (req, res) => {
  if (isPasswordSet()) {
    res.status(400).json({ error: 'Password is already set. Use /auth/login instead.' });
    return;
  }

  const { password } = req.body;
  if (!password || typeof password !== 'string' || password.length < 4) {
    res.status(400).json({ error: 'Password must be at least 4 characters' });
    return;
  }

  setPassword(password);
  const token = generateToken();

  res.json({ token, message: 'Password set successfully' });
});

// Login
router.post('/auth/login', (req, res) => {
  if (!isPasswordSet()) {
    res.status(400).json({ error: 'No password set. Use /auth/setup first.' });
    return;
  }

  const { password } = req.body;
  if (!password || typeof password !== 'string') {
    res.status(400).json({ error: 'Password is required' });
    return;
  }

  const stored = getStoredPassword();
  if (!stored || !verifyPassword(password, stored)) {
    res.status(401).json({ error: 'Invalid password' });
    return;
  }

  const token = generateToken();
  res.json({ token });
});

// Logout
router.post('/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    revokeToken(authHeader.slice(7));
  }
  res.json({ success: true });
});

// Change password
router.post('/auth/change-password', (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword || typeof newPassword !== 'string' || newPassword.length < 4) {
    res.status(400).json({ error: 'New password must be at least 4 characters' });
    return;
  }

  const stored = getStoredPassword();
  if (!stored || !verifyPassword(currentPassword, stored)) {
    res.status(401).json({ error: 'Current password is incorrect' });
    return;
  }

  setPassword(newPassword);

  // Invalidate all existing tokens by revoking them
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    revokeToken(authHeader.slice(7));
  }

  const token = generateToken();
  res.json({ token, message: 'Password changed successfully' });
});

export default router;
