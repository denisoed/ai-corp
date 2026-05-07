import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Globe, Key, Plus, Trash2, Eye, EyeOff, Check, Loader2, Play, Circle, X, Sparkles, Lock, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { MultiSelect } from '../ui/MultiSelect';
import { Tabs, TabPanel } from '../ui/Tabs';
import { SearchableSelect } from '../ui/SearchableSelect';
import { useStore } from '../../store';
import type { AppSettings, LLMProvider, HttpDomainConfig } from '../../types';
import { ConfirmDialog } from '../ui/ConfirmDialog';

const API_BASE = '/api';

interface ProviderDef {
  id: string;
  name: string;
  baseUrl: string;
  defaultModel: string;
  type: string;
  description?: string;
}

async function fetchSettings(): Promise<AppSettings> {
  const res = await fetch(`${API_BASE}/settings?_=${Date.now()}`);
  if (!res.ok) throw new Error(`GET /settings failed: ${res.status}`);
  return res.json();
}

async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  const res = await fetch(`${API_BASE}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error(`PUT /settings failed: ${res.status}`);
  return res.json();
}

async function fetchProviderDefs(): Promise<Record<string, ProviderDef>> {
  const res = await fetch(`${API_BASE}/settings/providers/defs`);
  if (!res.ok) throw new Error('Failed to fetch provider definitions');
  return res.json();
}

async function testProvider(providerId: string, apiKey: string, baseUrl?: string): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(`${API_BASE}/settings/providers/${providerId}/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, baseUrl }),
  });
  return res.json();
}

async function fetchProviderModels(providerId: string): Promise<{ models: string[]; error?: string }> {
  const res = await fetch(`${API_BASE}/settings/providers/${providerId}/models`);
  return res.json();
}

async function launchSearXng(): Promise<{ url: string; status: string; message: string }> {
  const res = await fetch(`${API_BASE}/settings/searxng/launch`, { method: 'POST' });
  if (!res.ok) throw new Error('Launch failed');
  return res.json();
}

async function fetchSearXngStatus(): Promise<{ running: boolean; url: string }> {
  const res = await fetch(`${API_BASE}/settings/searxng/status`);
  return res.json();
}

interface SettingFieldProps {
  label: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'password';
  placeholder?: string;
}

function SettingField({ label, description, value, onChange, type = 'text', placeholder }: SettingFieldProps) {
  const [visible, setVisible] = useState(false);
  const isPassword = type === 'password';

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-zinc-300">{label}</label>
      <div className="relative">
        <Input
          type={isPassword && !visible ? 'password' : 'text'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={isPassword ? 'pr-10' : ''}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setVisible(!visible)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      <p className="text-xs text-zinc-500">{description}</p>
    </div>
  );
}

function EnvVarRow({
  envKey,
  envValue,
  onKeyChange,
  onValueChange,
  onRemove,
}: {
  envKey: string;
  envValue: string;
  onKeyChange: (v: string) => void;
  onValueChange: (v: string) => void;
  onRemove: () => void;
  key?: React.Key;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="flex gap-2 items-start">
      <Input
        value={envKey}
        onChange={e => onKeyChange(e.target.value)}
        placeholder="KEY"
        className="w-1/3 font-mono text-xs"
      />
      <div className="relative flex-1">
        <Input
          type={visible ? 'text' : 'password'}
          value={envValue}
          onChange={e => onValueChange(e.target.value)}
          placeholder="value"
          className="pr-10 font-mono text-xs"
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      <Button variant="ghost" size="icon" onClick={onRemove} className="flex-shrink-0 text-zinc-600 hover:text-red-400">
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

const SEARCH_ENGINE_OPTIONS = [
  { value: 'brave', label: 'Brave Search' },
  { value: 'searxng', label: 'SearXNG' },
];

function DomainRow({ config, envVarKeys, onRemove, onHeaderChange }: {
  key?: string | number;
  config: HttpDomainConfig;
  envVarKeys: string[];
  onRemove: () => void;
  onHeaderChange: (key: string, value: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [newHeaderKey, setNewHeaderKey] = useState('');
  const [newHeaderValue, setNewHeaderValue] = useState('');
  const headers = config.headers || {};
  const headerEntries = Object.entries(headers);

  const addHeader = () => {
    const key = newHeaderKey.trim();
    if (!key || headers[key] !== undefined) return;
    onHeaderChange(key, newHeaderValue);
    setNewHeaderKey('');
    setNewHeaderValue('');
  };

  const insertVar = (varName: string) => {
    setNewHeaderValue(v => v + '$' + varName);
  };

  return (
    <div className="max-w-sm rounded-lg border border-zinc-800 bg-zinc-900/60">
      <div className="flex items-center justify-between px-3 py-2 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-zinc-500 shrink-0">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </span>
          <span className="text-sm text-zinc-200 truncate flex-1">{config.domain || '(unnamed)'}</span>
          {headerEntries.length > 0 && (
            <span className="text-[10px] text-zinc-500 shrink-0">({headerEntries.length})</span>
          )}
        </div>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onRemove(); }}
          className="text-zinc-500 hover:text-red-400 transition-colors shrink-0 ml-2"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-zinc-800 pt-3">
          {/* Existing headers */}
          {headerEntries.map(([key, value]) => (
            <div key={key} className="flex gap-2 items-start">
              <input
                type="text"
                value={key}
                disabled
                className="w-1/3 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-500 cursor-not-allowed"
              />
              <input
                type="text"
                value={value}
                onChange={e => onHeaderChange(key, e.target.value)}
                className="flex-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button
                onClick={() => onHeaderChange(key, '')}
                className="text-zinc-500 hover:text-red-400 transition-colors pt-0.5"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          {/* Add new header */}
          <div className="flex gap-2 items-start">
            <input
              type="text"
              value={newHeaderKey}
              onChange={e => setNewHeaderKey(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addHeader(); } }}
              placeholder="Header"
              className="w-1/3 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <div className="flex-1 relative">
              <input
                type="text"
                value={newHeaderValue}
                onChange={e => setNewHeaderValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addHeader(); } }}
                placeholder="Value (use $VAR_NAME)"
                className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {envVarKeys.length > 0 && newHeaderKey && (
                <div className="absolute right-1 top-1/2 -translate-y-1/2">
                  <select
                    value=""
                    onChange={e => { if (e.target.value) insertVar(e.target.value); }}
                    className="bg-zinc-700 border-0 rounded text-[10px] text-zinc-400 py-0.5 px-1 focus:outline-none"
                  >
                    <option value="">$VAR</option>
                    {envVarKeys.map(k => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <Button type="button" onClick={addHeader} disabled={!newHeaderKey.trim()} size="sm">
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Settings() {
  const [settings, setSettings] = useState<AppSettings>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [activeTab, setActiveTab] = useState('providers');

  const [launching, setLaunching] = useState(false);
  const [launchMessage, setLaunchMessage] = useState('');
  const [launchError, setLaunchError] = useState(false);
  const [searxngRunning, setSearxngRunning] = useState(false);
  const [searxngStatusLoading, setSearxngStatusLoading] = useState(false);

  const [providerDefs, setProviderDefs] = useState<Record<string, ProviderDef>>({});
  const [loadingProviderModels, setLoadingProviderModels] = useState<Record<string, boolean>>({});
  const [providerModels, setProviderModels] = useState<Record<string, string[]>>({});
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [providerTestResults, setProviderTestResults] = useState<Record<string, boolean>>({});
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [newProviderId, setNewProviderId] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [changePwStatus, setChangePwStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [changePwError, setChangePwError] = useState('');
  const [changingPw, setChangingPw] = useState(false);
  const [passwordRequired, setPasswordRequired] = useState(false);

  const [deletePasswordInput, setDeletePasswordInput] = useState('');
  const [deletePwStatus, setDeletePwStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [deletePwError, setDeletePwError] = useState('');
  const [deletingPw, setDeletingPw] = useState(false);

  // HTTP Integrations state
  const storeWorkspaces = useStore(s => s.workspaces);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [domains, setDomains] = useState<HttpDomainConfig[]>([]);
  const [integrationSaving, setIntegrationSaving] = useState(false);
  const [integrationStatus, setIntegrationStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  // Confirm dialog for domain deletion
  const [confirmDeleteDomain, setConfirmDeleteDomain] = useState<string | null>(null);

  // Sync domains only when workspace selection changes (ignore polling updates)
  const prevWorkspaceId = useRef(selectedWorkspaceId);
  useEffect(() => {
    if (prevWorkspaceId.current === selectedWorkspaceId) return;
    prevWorkspaceId.current = selectedWorkspaceId;
    const ws = storeWorkspaces.find(w => w.id === selectedWorkspaceId);
    const raw = ws?.settings?.allowedHttpDomains || [];
    // Migrate old string[] format
    const fromStore: HttpDomainConfig[] = raw.map((d: any) =>
      typeof d === 'string' ? { domain: d } : d
    );
    setDomains(fromStore);
  }, [selectedWorkspaceId, storeWorkspaces]);

  const handleChangePassword = async () => {
    setChangingPw(true);
    setChangePwError('');
    setChangePwStatus('idle');

    try {
      const token = localStorage.getItem('aicorp_token');

      // Use setup endpoint if no password exists yet
      const endpoint = passwordRequired ? '/api/auth/change-password' : '/api/auth/setup';
      const body = passwordRequired
        ? { currentPassword, newPassword }
        : { password: newPassword };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Password change failed');
      }

      const data = await res.json();
      if (data.token) {
        localStorage.setItem('aicorp_token', data.token);
      }
      setCurrentPassword('');
      setNewPassword('');
      setPasswordRequired(true);
      setChangePwStatus('saved');
    } catch (e: any) {
      setChangePwStatus('error');
      setChangePwError(e.message || 'Failed to change password');
    } finally {
      setChangingPw(false);
    }
  };

  const handleDeletePassword = async () => {
    setDeletingPw(true);
    setDeletePwError('');
    setDeletePwStatus('idle');

    try {
      const token = localStorage.getItem('aicorp_token');
      const res = await fetch('/api/auth/password', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ password: deletePasswordInput }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Password deletion failed');
      }

      localStorage.removeItem('aicorp_token');
      setDeletePasswordInput('');
      setPasswordRequired(false);
      setCurrentPassword('');
      setNewPassword('');
      setDeletePwStatus('saved');
      setTimeout(() => location.reload(), 800);
    } catch (e: any) {
      setDeletePwStatus('error');
      setDeletePwError(e.message || 'Failed to delete password');
    } finally {
      setDeletingPw(false);
    }
  };

  useEffect(() => {
    fetch('/api/auth/status')
      .then(r => r.json())
      .then(d => setPasswordRequired(d.requiresAuth))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchSettings()
      .then(s => {
        setSettings(s);
        setLoaded(true);
      })
      .catch(e => {
        console.error('Failed to load settings:', e);
        setLoaded(true);
      });
    fetchProviderDefs().then(setProviderDefs).catch(console.error);
  }, []);

  useEffect(() => {
    if (!loaded) return;

    const shouldCheckSearXng = settings.searchEngines?.includes('searxng') || Boolean(settings.searxngUrl);
    if (!shouldCheckSearXng) {
      setSearxngRunning(false);
      setSearxngStatusLoading(false);
      return;
    }

    let cancelled = false;
    setSearxngStatusLoading(true);

    fetchSearXngStatus()
      .then(s => {
        if (!cancelled) {
          setSearxngRunning(s.running);
        }
      })
      .catch(e => {
        if (!cancelled) {
          console.error('Failed to fetch SearXNG status:', e);
          setSearxngRunning(false);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSearxngStatusLoading(false);
        }
      });

    const interval = window.setInterval(() => {
      fetchSearXngStatus()
        .then(s => {
          if (!cancelled) {
            setSearxngRunning(s.running);
          }
        })
        .catch(e => {
          if (!cancelled) {
            console.error('Failed to refresh SearXNG status:', e);
            setSearxngRunning(false);
          }
        });
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [loaded, settings.searchEngines, settings.searxngUrl]);

  const updateField = useCallback((key: keyof AppSettings, value: string) => {
    setSettings(s => ({ ...s, [key]: value }));
    setSaveStatus('idle');
  }, []);

  const selectedEngines = settings.searchEngines || [];

  const handleEnginesChange = useCallback((engines: string[]) => {
    setSettings(s => ({ ...s, searchEngines: engines }));
    setSaveStatus('idle');
  }, []);

  const envVars: Record<string, string> = settings.envVars || {};
  const envEntries = Object.entries(envVars);

  const updateEnvVar = useCallback((oldKey: string, newKey: string, value: string) => {
    setSettings(s => {
      const vars = { ...(s.envVars || {}) };
      if (oldKey !== newKey) {
        delete vars[oldKey];
      }
      if (newKey) {
        vars[newKey] = value;
      }
      return { ...s, envVars: vars };
    });
    setSaveStatus('idle');
  }, []);

  const addEnvVar = useCallback(() => {
    setSettings(s => ({
      ...s,
      envVars: { ...(s.envVars || {}), '': '' },
    }));
  }, []);

  const removeEnvVar = useCallback((key: string) => {
    setSettings(s => {
      const vars = { ...(s.envVars || {}) };
      delete vars[key];
      return { ...s, envVars: vars };
    });
    setSaveStatus('idle');
  }, []);

  const providers: Record<string, LLMProvider> = settings.providers || {};
  const defaultProviderId = settings.defaultProviderId || '';

  const loadProviderModels = useCallback(async (providerId: string) => {
    if (providerModels[providerId] || loadingProviderModels[providerId]) return;
    setLoadingProviderModels(m => ({ ...m, [providerId]: true }));
    try {
      const result = await fetchProviderModels(providerId);
      setProviderModels(m => ({ ...m, [providerId]: result.models }));
    } catch (e) {
      console.error('Failed to load provider models:', e);
    } finally {
      setLoadingProviderModels(m => ({ ...m, [providerId]: false }));
    }
  }, [providerModels, loadingProviderModels]);

  useEffect(() => {
    if (!loaded) return;

    for (const [providerId, provider] of Object.entries(settings.providers || {})) {
      if (typeof provider === 'object' && provider !== null && 'enabled' in provider && (provider as LLMProvider).enabled) {
        loadProviderModels(providerId);
      }
    }
  }, [loaded, settings.providers, loadProviderModels]);

  const handleTestProvider = useCallback(async (providerId: string, apiKey: string, baseUrl?: string) => {
    setTestingProvider(providerId);
    try {
      const result = await testProvider(providerId, apiKey, baseUrl);
      setProviderTestResults(r => ({ ...r, [providerId]: result.success }));
    } catch (e) {
      setProviderTestResults(r => ({ ...r, [providerId]: false }));
    } finally {
      setTestingProvider(null);
    }
  }, []);

  const addProvider = useCallback(() => {
    if (!newProviderId) return;
    const def = providerDefs[newProviderId];
    if (!def) return;
    setSettings(s => ({
      ...s,
      providers: {
        ...s.providers,
        [newProviderId]: {
          id: newProviderId,
          name: def.name,
          apiKey: '',
          defaultModel: def.defaultModel,
        },
      },
    }));
    setNewProviderId('');
    setShowAddProvider(false);
    setSaveStatus('idle');
  }, [newProviderId, providerDefs]);

  const updateProvider = useCallback((providerId: string, updates: Partial<LLMProvider>) => {
    setSettings(s => ({
      ...s,
      providers: {
        ...s.providers,
        [providerId]: { ...s.providers?.[providerId], ...updates },
      },
    }));
    setSaveStatus('idle');
  }, []);

  const removeProvider = useCallback((providerId: string) => {
    setSettings(s => {
      const newProviders = { ...s.providers };
      delete newProviders[providerId];
      return {
        ...s,
        providers: newProviders,
        defaultProviderId: s.defaultProviderId === providerId ? '' : s.defaultProviderId,
      };
    });
    setSaveStatus('idle');
  }, []);

  const setDefaultProvider = useCallback((providerId: string) => {
    setSettings(s => ({ ...s, defaultProviderId: providerId }));
    setSaveStatus('idle');
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await saveSettings(settings);
      setSettings(result);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (e) {
      console.error('Failed to save settings:', e);
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  };

  const handleLaunch = async () => {
    setLaunching(true);
    setLaunchMessage('');
    setLaunchError(false);
    try {
      const result = await launchSearXng();
      setLaunchMessage(result.message);
      setLaunchError(result.status === 'error');
      if (result.status !== 'error') {
        setSettings(s => ({ ...s, searxngUrl: result.url }));
        const nextSettings = { ...settings, searxngUrl: result.url };
        const saved = await saveSettings(nextSettings);
        setSettings(saved);
        setSearxngRunning(true);
        setSearxngStatusLoading(false);
      }
    } catch (e: any) {
      setLaunchMessage(e.message);
      setLaunchError(true);
      setSearxngRunning(false);
    } finally {
      setLaunching(false);
    }
  };

  // Integration helpers
  const selectedWorkspace = storeWorkspaces.find(w => w.id === selectedWorkspaceId);
  const envVarKeys = [
    ...Object.keys(settings.envVars || {}),
    ...Object.keys(selectedWorkspace?.settings?.envVars || {}),
  ];

  const saveDomainsToServer = async (newDomains: HttpDomainConfig[]) => {
    if (!selectedWorkspaceId) return;
    setIntegrationSaving(true);
    setIntegrationStatus('idle');
    try {
      const token = localStorage.getItem('aicorp_token');
      const res = await fetch(`/api/workspaces/${selectedWorkspaceId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          settings: { ...selectedWorkspace?.settings, allowedHttpDomains: newDomains },
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      setIntegrationStatus('saved');
    } catch {
      setIntegrationStatus('error');
    } finally {
      setIntegrationSaving(false);
    }
  };

  const handleAddDomain = () => {
    const domain = newDomain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!domain || domain.includes(' ') || domains.some(d => d.domain === domain)) return;
    const next = [...domains, { domain }];
    setDomains(next);
    setNewDomain('');
    saveDomainsToServer(next);
  };

  const handleRemoveDomain = (domain: string) => {
    setConfirmDeleteDomain(domain);
  };

  const confirmRemoveDomain = () => {
    if (!confirmDeleteDomain) return;
    const next = domains.filter(d => d.domain !== confirmDeleteDomain);
    setDomains(next);
    setConfirmDeleteDomain(null);
    saveDomainsToServer(next);
  };

  const handleUpdateDomainHeader = (domain: string, headerKey: string, headerValue: string) => {
    const next = domains.map(d => {
      if (d.domain !== domain) return d;
      const headers = { ...(d.headers || {}) };
      if (headerValue) {
        headers[headerKey] = headerValue;
      } else {
        delete headers[headerKey];
      }
      return { ...d, headers };
    });
    setDomains(next);
    saveDomainsToServer(next);
  };

  // Auto-dismiss "Saved" indicator
  useEffect(() => {
    if (integrationStatus !== 'saved') return;
    const timer = setTimeout(() => setIntegrationStatus('idle'), 2500);
    return () => clearTimeout(timer);
  }, [integrationStatus]);

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  const braveEnabled = selectedEngines.includes('brave');
  const searxngEnabled = selectedEngines.includes('searxng');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Settings</h2>
          <p className="text-sm text-zinc-500 mt-0.5">Manage API keys, environment variables, and integrations.</p>
        </div>
        <Button onClick={handleSave} disabled={saving} size="sm">
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : saveStatus === 'saved' ? (
            <>
              <Check className="h-4 w-4 mr-2" />
              Saved
            </>
          ) : saveStatus === 'error' ? (
            'Retry'
          ) : (
            'Save Changes'
          )}
        </Button>
      </div>

      <Tabs
        tabs={[
          { id: 'providers', label: 'AI Providers', icon: <Sparkles className="h-4 w-4" /> },
          { id: 'search', label: 'Search', icon: <Search className="h-4 w-4" /> },
          { id: 'security', label: 'Security', icon: <Lock className="h-4 w-4" /> },
          { id: 'integrations', label: 'Integrations', icon: <Globe className="h-4 w-4" /> },
          { id: 'env', label: 'Environment', icon: <Key className="h-4 w-4" /> },
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      <TabPanel id="search" activeTab={activeTab}>
      <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5 text-indigo-400" />
            <h3 className="text-sm font-semibold text-white">Search & Web</h3>
          </div>

          {searxngEnabled && (
            <div className="shrink-0 flex items-center">
              {searxngRunning ? (
                <span className="inline-flex items-center gap-1.5 text-xs leading-none text-emerald-400">
                  <Circle className="h-2 w-2 fill-emerald-400 text-emerald-400" />
                  <span>SearXNG running</span>
                </span>
              ) : searxngStatusLoading ? (
                <span className="inline-flex items-center gap-1.5 text-xs leading-none text-zinc-400">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Checking SearXNG</span>
                </span>
              ) : null}
            </div>
          )}
        </div>
        <p className="text-xs text-zinc-500 mb-5">
          Configure web search and content fetching. Agents with <code className="text-zinc-400">system:web_search</code> permission use these settings.
        </p>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300">Search Engines</label>
            <MultiSelect
              options={SEARCH_ENGINE_OPTIONS}
              value={selectedEngines}
              onChange={handleEnginesChange}
              placeholder="Select engines..."
            />
            <p className="text-xs text-zinc-500">Enable Brave and/or SearXNG for better results. DuckDuckGo is always used as fallback when no other engine is available.</p>
          </div>

          {braveEnabled && (
            <SettingField
              label="Brave Search API Key"
              description="API key for Brave Search. Get one at brave.com/search/api"
              value={settings.braveApiKey || ''}
              onChange={v => updateField('braveApiKey', v)}
              type="password"
              placeholder="BSA-xxxxxxxxxxxxxxxx"
            />
          )}

          {searxngEnabled && (
            <div className="space-y-3">
              <SettingField
                label="SearXNG URL"
                description="URL of your SearXNG instance"
                value={settings.searxngUrl || ''}
                onChange={v => updateField('searxngUrl', v)}
                type="text"
                placeholder="http://localhost:8080"
              />

              <div className="space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLaunch}
                  disabled={launching}
                >
                  {launching ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Launching SearXNG...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Launch SearXNG
                    </>
                  )}
                </Button>

                {launchMessage && (
                  <p className={`text-xs ${launchError ? 'text-red-400' : 'text-emerald-400'}`}>
                    {launchMessage}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </section>
      </TabPanel>

      <TabPanel id="security" activeTab={activeTab}>
      <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Lock className="h-5 w-5 text-indigo-400" />
          <h3 className="text-sm font-semibold text-white">Change Password</h3>
        </div>
        <p className="text-xs text-zinc-500 mb-4">
          {passwordRequired
            ? 'Change your administrator password. You will need to re-login on all devices after changing.'
            : 'Set a password to protect access to the dashboard and API.'}
        </p>
        <div className="space-y-3 max-w-sm">
          {passwordRequired && (
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Enter current password"
              />
            </div>
          )}
          <div>
            <label className="block text-sm text-zinc-400 mb-1">
              {passwordRequired ? 'New Password' : 'Password'}
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder={passwordRequired ? 'Enter new password (min 4 chars)' : 'Choose a password (min 4 chars)'}
              minLength={4}
            />
          </div>

          {changePwError && (
            <div className="p-2.5 bg-red-900/30 border border-red-800 rounded-lg text-red-400 text-xs">
              {changePwError}
            </div>
          )}

          <Button
            onClick={handleChangePassword}
            disabled={changingPw || newPassword.length < 4 || (passwordRequired && !currentPassword)}
            size="sm"
          >
            {changingPw ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {passwordRequired ? 'Changing...' : 'Setting...'}
              </>
            ) : changePwStatus === 'saved' ? (
              <>
                <Check className="h-4 w-4 mr-2" />
                {passwordRequired ? 'Changed' : 'Password Set'}
              </>
            ) : (
              passwordRequired ? 'Change Password' : 'Set Password'
            )}
          </Button>
        </div>

        {passwordRequired && (
          <div className="mt-8 pt-6 border-t border-zinc-800">
            <div className="flex items-center gap-2 mb-4">
              <Trash2 className="h-5 w-5 text-red-400" />
              <h3 className="text-sm font-semibold text-white">Delete Password</h3>
            </div>
            <p className="text-xs text-zinc-500 mb-4">
              Remove the password entirely. Authentication will be disabled and all existing sessions will be terminated.
            </p>
            <div className="space-y-3 max-w-sm">
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Current Password</label>
                <input
                  type="password"
                  value={deletePasswordInput}
                  onChange={e => setDeletePasswordInput(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  placeholder="Enter your password to confirm"
                />
              </div>

              {deletePwError && (
                <div className="p-2.5 bg-red-900/30 border border-red-800 rounded-lg text-red-400 text-xs">
                  {deletePwError}
                </div>
              )}

              <Button
                onClick={handleDeletePassword}
                disabled={deletingPw || !deletePasswordInput}
                size="sm"
                variant="outline"
                className="border-red-800 text-red-400 hover:bg-red-900/30 hover:text-red-300"
              >
                {deletingPw ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : deletePwStatus === 'saved' ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Password Removed
                  </>
                ) : (
                  'Delete Password'
                )}
              </Button>
            </div>
          </div>
        )}
      </section>
      </TabPanel>

      <TabPanel id="integrations" activeTab={activeTab}>
      <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Globe className="h-5 w-5 text-indigo-400" />
          <h3 className="text-sm font-semibold text-white">HTTP API Access</h3>
        </div>
        <p className="text-xs text-zinc-500 mb-4">
          Configure which external domains agents can access via the <code className="text-zinc-400 bg-zinc-800 px-1 rounded">http_request</code> tool. When a whitelist is set, agents can only call APIs on listed domains.
        </p>

        <div className="mb-4 max-w-sm">
          <label className="block text-sm text-zinc-400 mb-1.5">Workspace</label>
          <SearchableSelect
            value={storeWorkspaces.find(w => w.id === selectedWorkspaceId)?.name || ''}
            options={storeWorkspaces.map(ws => ws.name)}
            placeholder="Select a workspace..."
            searchPlaceholder="Search workspaces..."
            onValueChange={(name) => {
              const ws = storeWorkspaces.find(w => w.name === name);
              setSelectedWorkspaceId(ws?.id || '');
            }}
          />
        </div>

        {selectedWorkspaceId && (
          <div className="space-y-4">
            <div className="flex gap-2 max-w-sm">
              <input
                type="text"
                value={newDomain}
                onChange={e => setNewDomain(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddDomain(); } }}
                className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="api.github.com"
              />
              <Button
                type="button"
                onClick={handleAddDomain}
                disabled={!newDomain.trim()}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>

            {domains.length > 0 ? (
              <div className="space-y-2">
                {domains.map((dc) => (
                  <DomainRow
                    key={dc.domain}
                    config={dc}
                    envVarKeys={envVarKeys}
                    onRemove={() => handleRemoveDomain(dc.domain)}
                    onHeaderChange={(key, value) => handleUpdateDomainHeader(dc.domain, key, value)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-600">No domains configured. All external domains are allowed.</p>
            )}

            {integrationStatus === 'error' && (
              <div className="p-2.5 bg-red-900/30 border border-red-800 rounded-lg text-red-400 text-xs max-w-sm">
                Failed to save. Try again.
              </div>
            )}

            {integrationStatus === 'saved' && (
              <div className="flex items-center gap-1 text-xs text-emerald-400">
                <Check className="h-3.5 w-3.5" />
                Saved
              </div>
            )}

            {integrationSaving && (
              <div className="flex items-center gap-1 text-xs text-zinc-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Saving...
              </div>
            )}
          </div>
        )}
      </section>

      {/* Confirm delete dialog */}
      {confirmDeleteDomain && (
        <ConfirmDialog
          title="Remove domain"
          message={`Remove "${confirmDeleteDomain}" from the allowed HTTP domains list? Agents will no longer be able to call APIs on this domain.`}
          confirmLabel="Remove"
          onConfirm={confirmRemoveDomain}
          onCancel={() => setConfirmDeleteDomain(null)}
        />
      )}
      </TabPanel>

      <TabPanel id="env" activeTab={activeTab}>
      {/* Environment Variables Section */}
      <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Key className="h-5 w-5 text-indigo-400" />
          <h3 className="text-sm font-semibold text-white">Environment Variables</h3>
        </div>
        <p className="text-xs text-zinc-500 mb-4">
          Define environment variables for tools and integrations. These values are stored securely and are never exposed to AI agents.
        </p>
        <div className="space-y-2">
          {envEntries.map(([k, val]) => (
            <EnvVarRow
              key={k}
              envKey={k}
              envValue={val}
              onKeyChange={newKey => updateEnvVar(k, newKey, val)}
              onValueChange={newVal => updateEnvVar(k, k, newVal)}
              onRemove={() => removeEnvVar(k)}
            />
          ))}
          {envEntries.length === 0 && (
            <p className="text-xs text-zinc-600 py-2">
              No environment variables defined yet. Add one to configure integrations, custom API endpoints, or credentials.
            </p>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={addEnvVar}
            className="mt-2 text-zinc-500 hover:text-zinc-300"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Variable
          </Button>
        </div>
      </section>
      </TabPanel>

      <TabPanel id="providers" activeTab={activeTab}>
      {/* AI Providers Section */}
      <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-5 w-5 text-indigo-400" />
          <h3 className="text-sm font-semibold text-white">AI Providers</h3>
        </div>
        <p className="text-xs text-zinc-500 mb-5">
          Configure AI model providers. Each provider requires an API key to connect. Models are loaded dynamically from the provider.
        </p>

        <div className="space-y-4">
          {(Object.values(providerDefs) as ProviderDef[]).map((def) => {
            const provider = providers[def.id];
            const isEnabled = provider?.enabled ?? false;
            const testResult = providerTestResults[def.id];
            const isTesting = testingProvider === def.id;
            const models = providerModels[def.id] || [];
            const isLoadingModels = loadingProviderModels[def.id];

            return (
              <div key={def.id} className="w-full p-4 bg-zinc-950 rounded-lg border border-zinc-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{def.name}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded ${isEnabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
                        {isEnabled ? 'Active' : 'Disabled'}
                      </span>
                    </div>
                    {def.description && (
                      <p className="text-xs text-zinc-500 mt-1">{def.description}</p>
                    )}
                  </div>
                  <Button
                    variant={isEnabled ? 'outline' : 'default'}
                    size="sm"
                    onClick={() => {
                      if (!provider) {
                        setSettings(s => ({
                          ...s,
                          providers: {
                            ...s.providers,
                            [def.id]: {
                              id: def.id,
                              name: def.name,
                              apiKey: '',
                              defaultModel: def.defaultModel,
                              enabled: true,
                            },
                          },
                          defaultProviderId: def.id,
                        }));
                      } else {
                        updateProvider(def.id, { enabled: !provider.enabled });
                      }
                      setSaveStatus('idle');
                    }}
                    className={isEnabled ? 'text-zinc-400 hover:text-zinc-200' : ''}
                  >
                    {isEnabled ? 'Disable' : 'Enable'}
                  </Button>
                </div>

                {provider && isEnabled && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Model</label>
                        <SearchableSelect
                          value={provider.defaultModel || ''}
                          options={models}
                          placeholder={isLoadingModels ? 'Loading...' : (models.length > 0 ? 'Select model...' : 'No models loaded')}
                          searchPlaceholder="Search models..."
                          onValueChange={(val) => updateProvider(def.id, { defaultModel: val })}
                          loading={isLoadingModels}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">API Key</label>
                        <Input
                          type="password"
                          value={provider.apiKey}
                          onChange={e => updateProvider(def.id, { apiKey: e.target.value })}
                          placeholder="sk-..."
                          className="bg-zinc-900 font-mono text-xs"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          loadProviderModels(def.id);
                          handleTestProvider(def.id, provider.apiKey, provider.baseUrl);
                        }}
                        disabled={isTesting || !provider.apiKey}
                      >
                        {isTesting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Test Connection
                      </Button>
                      {testResult !== undefined && (
                        <span className={`text-xs ${testResult ? 'text-emerald-400' : 'text-red-400'}`}>
                          {testResult ? 'Connected' : 'Failed'}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </section>
      </TabPanel>
    </div>
  );
}
