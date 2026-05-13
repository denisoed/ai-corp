import React, { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, FolderKanban, KanbanSquare, Activity, Clock, Shield, Settings, Menu, Bell, MessageSquare, LogOut, Workflow, ChevronDown, Plus, Users, FileText, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { Logo } from '../ui/Logo';
import { useStore } from '../../store';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [workspacesExpanded, setWorkspacesExpanded] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();
  const logout = useStore(s => s.logout);
  const authConfigured = useStore(s => s.authConfigured);
  const workspaces = useStore(s => s.workspaces);
  const activeWorkspaceId = useStore(s => s.activeWorkspaceId);
  const setActiveWorkspace = useStore(s => s.setActiveWorkspace);

  const activeWorkspace = activeWorkspaceId 
    ? workspaces.find(w => w.id === activeWorkspaceId) 
    : null;

  const handleLogout = async () => {
    await logout();
  };

  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  const handleWorkspaceSelect = (workspaceId: string) => {
    setActiveWorkspace(workspaceId);
    navigate(`/workspaces/${workspaceId}`);
    setWorkspacesExpanded(true);
  };

  const isWorkspacePage = location.pathname.startsWith('/workspaces/');
  const workspaceSection = isWorkspacePage && activeWorkspace;

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-300 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-72 border-r border-zinc-800 bg-zinc-950 flex flex-col transition-transform md:relative md:translate-x-0 hidden md:flex",
        mobileOpen ? "translate-x-0 !flex" : "-translate-x-full"
      )}>
        {/* Logo */}
        <div className="flex h-16 items-center border-b border-zinc-800 px-4 gap-3">
          <Logo className="w-8 h-8" />
          <span className="font-semibold tracking-tight text-white">AI Corp</span>
        </div>

        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {/* Dashboard - always visible */}
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              cn(
                "w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-zinc-800 text-indigo-400"
                  : "text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300"
              )
            }
          >
            <LayoutDashboard className="h-5 w-5" />
            <span>Dashboard</span>
          </NavLink>

          {/* Workspaces section */}
          <div className="pt-2">
            <button
              onClick={() => setWorkspacesExpanded(!workspacesExpanded)}
              className="w-full flex items-center justify-between space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300 transition-colors"
            >
              <div className="flex items-center space-x-3">
                <FolderKanban className="h-5 w-5" />
                <span>Workspaces</span>
              </div>
              <ChevronDown className={cn("h-4 w-4 transition-transform", workspacesExpanded ? "rotate-0" : "-rotate-90")} />
            </button>

            {workspacesExpanded && (
              <div className="mt-1 ml-2 space-y-0.5">
                {workspaces.map(workspace => (
                  <button
                    key={workspace.id}
                    onClick={() => handleWorkspaceSelect(workspace.id)}
                    className={cn(
                      "w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm transition-colors",
                      activeWorkspaceId === workspace.id
                        ? "bg-zinc-800 text-indigo-400"
                        : "text-zinc-500 hover:bg-zinc-800/30 hover:text-zinc-400"
                    )}
                  >
                    <div className="w-2 h-2 rounded-full bg-zinc-600" />
                    <span className="truncate">{workspace.name}</span>
                  </button>
                ))}
                
                {/* Add new workspace button */}
                <button
                  onClick={() => { navigate('/workspaces'); setActiveWorkspace(null); }}
                  className="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm text-zinc-600 hover:bg-zinc-800/30 hover:text-zinc-400 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add Workspace</span>
                </button>
              </div>
            )}
          </div>

          {/* Workspace-specific navigation */}
          {workspaceSection && (
            <div className="pt-4 mt-4 border-t border-zinc-800">
              <div className="px-3 mb-2">
                <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  {activeWorkspace.name}
                </div>
              </div>
              <div className="space-y-0.5">
                <NavLink
                  to={`/workspaces/${activeWorkspaceId}/agents`}
                  className={({ isActive }) =>
                    cn(
                      "w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm transition-colors",
                      isActive
                        ? "bg-zinc-800 text-indigo-400"
                        : "text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300"
                    )
                  }
                >
                  <Users className="h-4 w-4" />
                  <span>Agents</span>
                </NavLink>
                <NavLink
                  to={`/workspaces/${activeWorkspaceId}/board`}
                  className={({ isActive }) =>
                    cn(
                      "w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm transition-colors",
                      isActive
                        ? "bg-zinc-800 text-indigo-400"
                        : "text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300"
                    )
                  }
                >
                  <KanbanSquare className="h-4 w-4" />
                  <span>Task Board</span>
                </NavLink>
                <NavLink
                  to={`/workspaces/${activeWorkspaceId}/roles`}
                  className={({ isActive }) =>
                    cn(
                      "w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm transition-colors",
                      isActive
                        ? "bg-zinc-800 text-indigo-400"
                        : "text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300"
                    )
                  }
                >
                  <Shield className="h-4 w-4" />
                  <span>Roles</span>
                </NavLink>
                <NavLink
                  to={`/workspaces/${activeWorkspaceId}/crons`}
                  className={({ isActive }) =>
                    cn(
                      "w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm transition-colors",
                      isActive
                        ? "bg-zinc-800 text-indigo-400"
                        : "text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300"
                    )
                  }
                >
                  <Clock className="h-4 w-4" />
                  <span>Cron Jobs</span>
                </NavLink>
                <NavLink
                  to={`/workspaces/${activeWorkspaceId}/pipelines`}
                  className={({ isActive }) =>
                    cn(
                      "w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm transition-colors",
                      isActive
                        ? "bg-zinc-800 text-indigo-400"
                        : "text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300"
                    )
                  }
                >
                  <Workflow className="h-4 w-4" />
                  <span>Pipelines</span>
                </NavLink>
              </div>
            </div>
          )}

          {/* Global sections */}
          <div className="pt-4 mt-4 border-t border-zinc-800">
            <div className="px-3 mb-2">
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Global</span>
            </div>
            <div className="space-y-0.5">
              <NavLink
                to="/chats"
                className={({ isActive }) =>
                  cn(
                    "w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                    isActive
                      ? "bg-zinc-800 text-indigo-400"
                      : "text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300"
                  )
                }
              >
                <MessageSquare className="h-5 w-5" />
                <span>Chats</span>
              </NavLink>
              <NavLink
                to="/events"
                className={({ isActive }) =>
                  cn(
                    "w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                    isActive
                      ? "bg-zinc-800 text-indigo-400"
                      : "text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300"
                  )
                }
              >
                <Bell className="h-5 w-5" />
                <span>Events</span>
              </NavLink>
              <NavLink
                to="/logs"
                className={({ isActive }) =>
                  cn(
                    "w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                    isActive
                      ? "bg-zinc-800 text-indigo-400"
                      : "text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300"
                  )
                }
              >
                <Activity className="h-5 w-5" />
                <span>Activity Logs</span>
              </NavLink>
            </div>
          </div>
        </div>

        {/* Bottom section */}
        <div className="mt-auto mb-4 px-3 py-4 border-t border-zinc-800 space-y-1">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              cn(
                "w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-zinc-800 text-indigo-400"
                  : "text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300"
              )
            }
          >
            <Settings className="h-5 w-5" />
            <span>Settings</span>
          </NavLink>
          {authConfigured && (
            <button
              onClick={handleLogout}
              className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300"
            >
              <LogOut className="h-5 w-5" />
              <span>Logout</span>
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 border-b border-zinc-800 flex items-center justify-between px-6 bg-zinc-900/50">
          <div className="flex items-center gap-4 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              <Menu className="h-5 w-5 text-zinc-300" />
            </Button>
            
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-sm">
              {activeWorkspace && (
                <>
                  <span 
                    className="text-zinc-500 cursor-pointer hover:text-zinc-300"
                    onClick={() => { navigate('/workspaces'); setActiveWorkspace(null); }}
                  >
                    Workspaces
                  </span>
                  <span className="text-zinc-600">/</span>
                  <span className="text-white font-medium">{activeWorkspace.name}</span>
                </>
              )}
              {!activeWorkspace && location.pathname !== '/workspaces' && (
                <span className="text-white font-medium capitalize">
                  {location.pathname.slice(1).replace('-', ' ')}
                </span>
              )}
              {location.pathname === '/workspaces' && (
                <span className="text-white font-medium">Workspaces</span>
              )}
            </div>
          </div>
          
          {/* Active workspace indicator */}
          {activeWorkspace && (
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-zinc-800/50 rounded-lg">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-xs text-zinc-400">{activeWorkspace.name}</span>
              <button 
                onClick={() => { setActiveWorkspace(null); navigate('/workspaces'); }}
                className="text-zinc-500 hover:text-zinc-300"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          
          <span className="hidden md:inline-flex px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-xs rounded border border-emerald-500/20 whitespace-nowrap ml-auto">SYSTEM STABLE</span>
        </header>

        <main className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
          {children}
        </main>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
    </div>
  );
}