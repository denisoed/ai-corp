/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import { Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom';
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
import { SetupWizard } from './components/views/SetupWizard';
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


function WorkspaceDetail() {
  const { id } = useParams();
  return <WorkspacesList key={id ?? 'workspace-detail'} />;
}

// Wrapper components for workspace-scoped pages
function WorkspaceAgents() {
  const { id } = useParams();
  const setActiveWorkspace = useStore(s => s.setActiveWorkspace);
  const workspaces = useStore(s => s.workspaces);
  
  useEffect(() => {
    if (id && workspaces.find(w => w.id === id)) {
      setActiveWorkspace(id);
    }
  }, [id, workspaces, setActiveWorkspace]);
  
  return <WorkspacesList />;
}

function WorkspaceBoard() {
  const { id } = useParams();
  const setActiveWorkspace = useStore(s => s.setActiveWorkspace);
  const workspaces = useStore(s => s.workspaces);
  
  useEffect(() => {
    if (id && workspaces.find(w => w.id === id)) {
      setActiveWorkspace(id);
    }
  }, [id, workspaces, setActiveWorkspace]);
  
  return <TaskBoard />;
}

function WorkspaceRoles() {
  const { id } = useParams();
  const setActiveWorkspace = useStore(s => s.setActiveWorkspace);
  const workspaces = useStore(s => s.workspaces);
  
  useEffect(() => {
    if (id && workspaces.find(w => w.id === id)) {
      setActiveWorkspace(id);
    }
  }, [id, workspaces, setActiveWorkspace]);
  
  return <RolesManagement />;
}

function WorkspaceCrons() {
  const { id } = useParams();
  const setActiveWorkspace = useStore(s => s.setActiveWorkspace);
  const workspaces = useStore(s => s.workspaces);
  
  useEffect(() => {
    if (id && workspaces.find(w => w.id === id)) {
      setActiveWorkspace(id);
    }
  }, [id, workspaces, setActiveWorkspace]);
  
  return <CronJobs />;
}

function WorkspacePipelines() {
  const { id } = useParams();
  const setActiveWorkspace = useStore(s => s.setActiveWorkspace);
  const workspaces = useStore(s => s.workspaces);
  
  useEffect(() => {
    if (id && workspaces.find(w => w.id === id)) {
      setActiveWorkspace(id);
    }
  }, [id, workspaces, setActiveWorkspace]);
  
  return <PipelinesList />;
}

// Backward compatibility - redirect old routes to /workspaces
function LegacyRedirect() {
  const location = useLocation();
  return <Navigate to="/workspaces" replace />;
}

export default function App() {
  const authRequired = useStore(s => s.authRequired);
  const authChecking = useStore(s => s.authChecking);
  const checkAuth = useStore(s => s.checkAuth);
  const workspaces = useStore(s => s.workspaces);
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
  }, []);

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

  // Show Setup Wizard if no workspaces exist
  if (workspaces.length === 0) {
    return <SetupWizard />;
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/workspaces" replace />} />
        
        {/* Main pages */}
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/workspaces" element={<WorkspacesList />} />
        
        {/* Workspace-specific routes */}
        <Route path="/workspaces/:id" element={<WorkspaceDetail />} />
        <Route path="/workspaces/:id/agents" element={<WorkspaceAgents />} />
        <Route path="/workspaces/:id/board" element={<WorkspaceBoard />} />
        <Route path="/workspaces/:id/roles" element={<WorkspaceRoles />} />
        <Route path="/workspaces/:id/crons" element={<WorkspaceCrons />} />
        <Route path="/workspaces/:id/pipelines" element={<WorkspacePipelines />} />
        
        {/* Global pages */}
        <Route path="/chats" element={<ChatsPage />} />
        <Route path="/logs" element={<ActivityLogs />} />
        <Route path="/events" element={<EventsManagement />} />
        <Route path="/settings" element={<Settings />} />
        
        {/* Legacy routes - redirect to /workspaces */}
        <Route path="/board" element={<LegacyRedirect />} />
        <Route path="/roles" element={<LegacyRedirect />} />
        <Route path="/crons" element={<LegacyRedirect />} />
        <Route path="/pipelines" element={<LegacyRedirect />} />
        
        {/* Pipeline detail */}
        <Route path="/pipelines/:id" element={<PipelineDetail />} />
      </Routes>
    </Layout>
  );
}