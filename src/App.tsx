/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { Dashboard } from './components/views/Dashboard';
import { WorkspacesList } from './components/views/WorkspacesList';
import { ChatsPage } from './components/views/ChatsPage';
import { TaskBoard } from './components/views/TaskBoard';
import { ActivityLogs } from './components/views/ActivityLogs';
import { CronJobs } from './components/views/CronJobs';
import { RolesManagement } from './components/views/RolesManagement';
import { EventsManagement } from './components/views/EventsManagement';
import { Settings } from './components/views/Settings';
import { useStore } from './store';
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
  useSync();
  useTelegramManager();

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/workspaces" element={<WorkspacesList />} />
        <Route path="/chats" element={<ChatsPage />} />
        <Route path="/board" element={<TaskBoard />} />
        <Route path="/logs" element={<ActivityLogs />} />
        <Route path="/crons" element={<CronJobs />} />
        <Route path="/roles" element={<RolesManagement />} />
        <Route path="/events" element={<EventsManagement />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Layout>
  );
}
