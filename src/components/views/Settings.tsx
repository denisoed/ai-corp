import React, { useState, useEffect, useCallback } from 'react';
import { Search, Globe, Key, Plus, Trash2, Eye, EyeOff, Check, Loader2, Play, Circle, X, Sparkles } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { MultiSelect } from '../ui/MultiSelect';
import { Tabs, TabPanel } from '../ui/Tabs';
import type { AppSettings, LLMProvider } from '../../types';

const API_BASE = '/api';

interface ProviderDef {
  id: string;
  name: string;
  baseUrl: string;
  defaultModel: string;
  type: string;
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

  const [providerDefs, setProviderDefs] = useState<Record<string, ProviderDef>>({});
  const [loadingProviderModels, setLoadingProviderModels] = useState<Record<string, boolean>>({});
  const [providerModels, setProviderModels] = useState<Record<string, string[]>>({});
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [providerTestResults, setProviderTestResults] = useState<Record<string, boolean>>({});
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [newProviderId, setNewProviderId] = useState('');

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
    if (settings.searchEngines?.includes('searxng')) {
      fetchSearXngStatus().then(s => setSearxngRunning(s.running));
    }
  }, [settings.searchEngines]);

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
        setSearxngRunning(true);
      }
    } catch (e: any) {
      setLaunchMessage(e.message);
      setLaunchError(true);
    } finally {
      setLaunching(false);
    }
  };

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
    <div className="max-w-2xl mx-auto space-y-6">
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
          { id: 'env', label: 'Environment', icon: <Key className="h-4 w-4" /> },
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      <TabPanel id="search" activeTab={activeTab}>
      <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Search className="h-5 w-5 text-indigo-400" />
          <h3 className="text-sm font-semibold text-white">Search & Web</h3>
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

                {searxngRunning && !launching && (
                  <span className="inline-flex items-center gap-1.5 ml-3 text-xs">
                    <Circle className="h-2 w-2 fill-emerald-400 text-emerald-400" />
                    <span className="text-emerald-400">Running</span>
                  </span>
                )}

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
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-indigo-400" />
            <h3 className="text-sm font-semibold text-white">AI Providers</h3>
          </div>
          {!showAddProvider && (
            <Button variant="ghost" size="sm" onClick={() => setShowAddProvider(true)} className="text-zinc-400 hover:text-zinc-200">
              <Plus className="h-4 w-4 mr-1" />
              Add Provider
            </Button>
          )}
        </div>
        <p className="text-xs text-zinc-500 mb-5">
          Configure AI model providers. Each provider can have its own API key and default model. Set a default provider or configure per-agent in the agent settings.
        </p>

        {showAddProvider && (
          <div className="flex gap-2 mb-4 p-3 bg-zinc-950 rounded-lg border border-zinc-800">
            <select
              value={newProviderId}
              onChange={e => setNewProviderId(e.target.value)}
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200"
            >
              <option value="">Select provider...</option>
{Object.entries(providerDefs).map(([id, def]) => {
                const d = def as ProviderDef;
                return !providers[id] && <option key={id} value={id}>{d.name}</option>;
              })}
            </select>
            <Button size="sm" onClick={addProvider} disabled={!newProviderId}>Add</Button>
            <Button variant="ghost" size="sm" onClick={() => { setShowAddProvider(false); setNewProviderId(''); }}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        <div className="space-y-3">
          {Object.entries(providers).map(([id, provider]) => {
            const def = providerDefs[id];
            const isDefault = defaultProviderId === id;
            const testResult = providerTestResults[id];
            const isTesting = testingProvider === id;
            const models = providerModels[id] || [];
            const isLoadingModels = loadingProviderModels[id];

            return (
              <div key={id} className="p-4 bg-zinc-950 rounded-lg border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="defaultProvider"
                      checked={isDefault}
                      onChange={() => setDefaultProvider(id)}
                      className="accent-indigo-500"
                    />
                    <span className="text-sm font-medium text-white">{provider.name}</span>
                    {isDefault && (
                      <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded">Default</span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeProvider(id)}
                    className="text-zinc-600 hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">API Key</label>
                    <Input
                      type="password"
                      value={provider.apiKey}
                      onChange={e => updateProvider(id, { apiKey: e.target.value })}
                      placeholder="sk-..."
                      className="bg-zinc-900 font-mono text-xs"
                    />
                  </div>
                  {def && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Default Model</label>
                      <Input
                        value={provider.defaultModel}
                        onChange={e => updateProvider(id, { defaultModel: e.target.value })}
                        placeholder={def.defaultModel}
                        className="bg-zinc-900 text-xs"
                      />
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTestProvider(id, provider.apiKey, provider.baseUrl)}
                    disabled={isTesting || !provider.apiKey}
                  >
                    {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Test Connection'}
                  </Button>
                  {testResult !== undefined && (
                    <span className={`text-xs ${testResult ? 'text-emerald-400' : 'text-red-400'}`}>
                      {testResult ? 'Connected' : 'Failed'}
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {Object.keys(providers).length === 0 && (
            <p className="text-xs text-zinc-600 py-4 text-center">
              No AI providers configured. Add a provider to enable AI-powered agents.
            </p>
          )}
        </div>
      </section>
      </TabPanel>
    </div>
  );
}
