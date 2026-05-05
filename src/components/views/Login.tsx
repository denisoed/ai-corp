import React, { useState, useEffect, useCallback } from 'react';
import { useStore } from '../../store';

const TIMEOUT = 5000;

function fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSetup, setIsSetup] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const login = useStore(s => s.login);
  const setupPassword = useStore(s => s.setupPassword);

  const checkStatus = useCallback(() => {
    setIsSetup(null);
    setError('');
    fetchWithTimeout('/api/auth/status', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => setIsSetup(data.requiresAuth ? 'login' : 'setup'))
      .catch(() => {
        setError('Server is not reachable. Retrying...');
        setTimeout(() => setRetryCount(c => c + 1), 2000);
      });
  }, []);

  useEffect(() => {
    checkStatus();
  }, [retryCount]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSetup === 'setup') {
        await setupPassword(password);
      } else {
        await login(password);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  if (isSetup === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="text-center">
          <div className="text-gray-400 text-lg mb-2">
            {error ? error : 'Connecting to server...'}
          </div>
          {error && (
            <button
              onClick={() => { setRetryCount(c => c + 1); }}
              className="text-sm text-indigo-400 hover:text-indigo-300 underline"
            >
              Retry now
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="w-full max-w-md p-8 bg-gray-900 rounded-xl border border-gray-800 shadow-2xl">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">AI Corp</h1>
          <p className="text-gray-400">
            {isSetup === 'setup'
              ? 'Set up your administrator password'
              : 'Sign in to continue'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder={isSetup === 'setup' ? 'Choose a password (min 4 chars)' : 'Enter your password'}
              autoFocus
              minLength={4}
              required
            />
          </div>

          {error && (
            <div className="p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || password.length < 4}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg font-medium transition-colors"
          >
            {loading ? 'Please wait...' : isSetup === 'setup' ? 'Set Password' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
