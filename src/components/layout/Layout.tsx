import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, FolderKanban, KanbanSquare, Activity, Clock, Shield, Settings, Menu, Bell, MessageSquare } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { Logo } from '../ui/Logo';

interface SidebarItemProps {
  key?: React.Key;
  icon: React.ElementType;
  label: string;
  to: string;
  onClick?: () => void;
}

function SidebarItem({ icon: Icon, label, to, onClick }: SidebarItemProps) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          "w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
          isActive
            ? "bg-zinc-800 text-indigo-400"
            : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
        )
      }
    >
      <Icon className="h-5 w-5" />
      <span>{label}</span>
    </NavLink>
  );
}

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  const viewName = location.pathname.slice(1).replace('-', ' ') || 'dashboard';

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'workspaces', label: 'Workspaces', icon: FolderKanban },
    { id: 'chats', label: 'Chats', icon: MessageSquare },
    { id: 'board', label: 'Task Board', icon: KanbanSquare },
    { id: 'crons', label: 'Cron Jobs', icon: Clock },
    { id: 'roles', label: 'Roles', icon: Shield },
    { id: 'events', label: 'Events', icon: Bell },
    { id: 'logs', label: 'Activity Logs', icon: Activity },
  ];

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-300 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 border-r border-zinc-800 bg-zinc-950 flex flex-col transition-transform md:relative md:translate-x-0 hidden md:flex",
        mobileOpen ? "translate-x-0 !flex" : "-translate-x-full"
      )}>
        <div className="flex h-16 items-center border-b border-zinc-800 px-6 gap-3">
          <Logo className="w-8 h-8" />
          <span className="font-semibold tracking-tight text-white">AI Corp</span>
        </div>
        <div className="p-4 space-y-2 flex-col flex-1">
          {navItems.map(item => (
            <SidebarItem
              key={item.id}
              icon={item.icon}
              label={item.label}
              to={`/${item.id}`}
            />
          ))}
        </div>

        <div className="mt-auto mb-4 px-4">
          <SidebarItem
            icon={Settings}
            label="Settings"
            to="/settings"
          />
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
            <h1 className="text-xl font-semibold text-white tracking-tight truncate"><span className="text-zinc-500 font-normal hidden sm:inline-block capitalize">{viewName}</span></h1>
          </div>
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
