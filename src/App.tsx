/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
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
import { PipelinesList } from './components/views/PipelinesList';
import { PipelineDetail } from './components/views/PipelineDetail';
import { Login } from './components/views/Login';
import { useStore } from './store';
import { useTelegramManager } from './lib/telegramAdapter';

function useSync() {
  const fetchState = useStore(state => state.fetchState);
  const authRequired = useStore(state => state.authRequired);

  useEffect(() => {
    if (authRequired) return;
    fetchState();
    const interval = setInterval(() => {
      fetchState();
    }, 2000);
    return () => clearInterval(interval);
  }, [fetchState, authRequired]);
}

export default function App() {
  const authRequired = useStore(s => s.authRequired);
  const authChecking = useStore(s => s.authChecking);
  const checkAuth = useStore(s => s.checkAuth);
  const didCheckAuth = useRef(false);

  useEffect(() => {
    if (didCheckAuth.current) return;
    didCheckAuth.current = true;
    checkAuth();

    const handleAuthRequired = () => {
      useStore.setState({ authRequired: true, authChecking: false });
    };
    window.addEventListener('aicorp:auth-required', handleAuthRequired);
    return () => window.removeEventListener('aicorp:auth-required', handleAuthRequired);
  }, []); // Run once on mount

  useSync();
  useTelegramManager();

  if (authChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="text-gray-400 text-lg">Loading...</div>
      </div>
    );
  }

  if (authRequired) {
    return <Login />;
  }

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
        <Route path="/pipelines" element={<PipelinesList />} />
        <Route path="/pipelines/:id" element={<PipelineDetail />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Layout>
  );
}
