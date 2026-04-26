/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Layout } from './components/layout/Layout';
import { Dashboard } from './components/views/Dashboard';
import { WorkspacesList } from './components/views/WorkspacesList';
import { TaskBoard } from './components/views/TaskBoard';
import { ActivityLogs } from './components/views/ActivityLogs';
import { useStore } from './store';
import { useOrchestrator } from './lib/orchestrator';
import { useTelegramManager } from './lib/telegramAdapter';

function useSync() {
  const fetchState = useStore(state => state.fetchState);

  useEffect(() => {
    fetchState();
    const interval = setInterval(() => {
      fetchState();
    }, 2000);
    return () => clearInterval(interval);
  }, [fetchState]);
}

export default function App() {
  // If no agents, start on agents view
  const agents = useStore(state => state.agents);
  const [activeView, setActiveView] = useState(agents.length === 0 ? 'agents' : 'dashboard');

  // Sync state with backend server every 2 seconds
  useSync();

  // These are now server-side only (kept for compatibility)
  useOrchestrator();
  useTelegramManager();

  const renderView = () => {
    switch (activeView) {
      case 'dashboard':
        return <Dashboard />;
      case 'workspaces':
        return <WorkspacesList />;
      case 'board':
        return <TaskBoard />;
      case 'logs':
        return <ActivityLogs />;
      case 'settings':
        return <div className="p-4 border rounded-lg border-zinc-800 bg-zinc-900 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">Company Settings (Coming soon)</div>;
      default:
        return <Dashboard />;
    }
  };

  return (
    <Layout activeView={activeView} onViewChange={setActiveView}>
      {renderView()}
    </Layout>
  );
}
