/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Layout } from './components/layout/Layout';
import { Dashboard } from './components/views/Dashboard';
import { AgentsList } from './components/views/AgentsList';
import { TaskBoard } from './components/views/TaskBoard';
import { ActivityLogs } from './components/views/ActivityLogs';
import { useStore } from './store';
import { useOrchestrator } from './lib/orchestrator';
import { useTelegramManager } from './lib/telegramAdapter';

export default function App() {
  // If no agents, start on agents view
  const agents = useStore(state => state.agents);
  const [activeView, setActiveView] = useState(agents.length === 0 ? 'agents' : 'dashboard');

  // Start the autonomous engine
  useOrchestrator();

  // Start the Telegram bot manager
  useTelegramManager();

  const renderView = () => {
    switch (activeView) {
      case 'dashboard':
        return <Dashboard />;
      case 'agents':
        return <AgentsList />;
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

