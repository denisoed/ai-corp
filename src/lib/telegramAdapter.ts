import { useEffect } from 'react';

/**
 * Telegram polling now runs on the backend server.
 * This hook is kept for compatibility but does nothing on the client.
 */
export function useTelegramManager() {
  useEffect(() => {
    // NOP — server handles Telegram bots
  }, []);
}
