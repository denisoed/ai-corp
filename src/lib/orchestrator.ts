import { useEffect } from 'react';

/**
 * The orchestrator now runs on the backend server.
 * This hook is kept for compatibility but does nothing on the client.
 */
export function useOrchestrator() {
  useEffect(() => {
    // NOP — server handles orchestration
  }, []);
}
