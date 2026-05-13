import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, Code, Megaphone, Database, ArrowRight, ArrowLeft, Check, Plus, Sparkles } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { COMPANY_TEMPLATES } from '../../lib/templates';
import { useStore } from '../../store';
import { cn } from '../../lib/utils';

const TEMPLATE_ICONS = {
  'software-dev': Code,
  'marketing-agency': Megaphone,
  'data-science': Database,
};

const TEMPLATE_COLORS = {
  'software-dev': 'from-blue-500/20 to-indigo-500/20 border-blue-500/30',
  'marketing-agency': 'from-pink-500/20 to-rose-500/20 border-pink-500/30',
  'data-science': 'from-green-500/20 to-emerald-500/20 border-green-500/30',
};

export function SetupWizard() {
  const navigate = useNavigate();
  const addWorkspace = useStore(s => s.addWorkspace);
  const applyTemplate = useStore(s => s.applyTemplate);
  const setActiveWorkspace = useStore(s => s.setActiveWorkspace);
  
  const [step, setStep] = useState(1);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    const template = COMPANY_TEMPLATES.find(t => t.id === templateId);
    if (template) {
      setWorkspaceName(template.name);
    }
  };

  const handleCreateWorkspace = async () => {
    if (!workspaceName.trim()) return;
    
    setIsLoading(true);
    try {
      const slug = workspaceName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      await addWorkspace({ 
        name: workspaceName.trim(), 
        slug,
        description: selectedTemplate ? `Workspace created from ${selectedTemplate} template` : 'New workspace'
      });
      
      // If a template was selected, apply it
      if (selectedTemplate) {
        const workspaces = useStore.getState().workspaces;
        const newWorkspace = workspaces[workspaces.length - 1];
        const template = COMPANY_TEMPLATES.find(t => t.id === selectedTemplate);
        if (template && newWorkspace) {
          await applyTemplate(template, newWorkspace.id);
          setActiveWorkspace(newWorkspace.id);
        }
      }
      
      setStep(3); // Success step
    } catch (error) {
      console.error('Failed to create workspace:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoToWorkspaces = () => {
    navigate('/workspaces');
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <div className="w-full max-w-4xl">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 mb-4">
            <Sparkles className="w-8 h-8 text-indigo-400" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Welcome to AI Corp</h1>
          <p className="text-zinc-400">Let's set up your first AI team in just a few steps</p>
        </div>

        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-4 mb-10">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors",
                step >= s 
                  ? "bg-indigo-500 text-white" 
                  : "bg-zinc-800 text-zinc-500"
              )}>
                {step > s ? <Check className="w-4 h-4" /> : s}
              </div>
              {s < 3 && (
                <div className={cn(
                  "w-16 h-0.5",
                  step > s ? "bg-indigo-500" : "bg-zinc-800"
                )} />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-8">
          
          {/* Step 1: Choose Template */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-xl font-semibold text-white mb-2">Choose a Team Template</h2>
                <p className="text-zinc-400 text-sm">Start with a pre-configured team or create from scratch</p>
              </div>
              
              <div className="grid gap-4 md:grid-cols-3">
                {COMPANY_TEMPLATES.map((template) => {
                  const Icon = TEMPLATE_ICONS[template.id as keyof typeof TEMPLATE_ICONS] || Briefcase;
                  const colorClass = TEMPLATE_COLORS[template.id as keyof typeof TEMPLATE_COLORS] || TEMPLATE_COLORS['software-dev'];
                  
                  return (
                    <button
                      key={template.id}
                      onClick={() => handleTemplateSelect(template.id)}
                      className={cn(
                        "p-6 rounded-xl border transition-all text-left hover:scale-[1.02]",
                        selectedTemplate === template.id
                          ? `bg-gradient-to-br ${colorClass} border-indigo-500 ring-2 ring-indigo-500/50`
                          : "bg-zinc-800/30 border-zinc-700 hover:border-zinc-600"
                      )}
                    >
                      <div className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center mb-4",
                        template.id === 'software-dev' ? "bg-blue-500/20 text-blue-400" :
                        template.id === 'marketing-agency' ? "bg-pink-500/20 text-pink-400" :
                        "bg-green-500/20 text-green-400"
                      )}>
                        <Icon className="w-6 h-6" />
                      </div>
                      <h3 className="font-semibold text-white mb-1">{template.name}</h3>
                      <p className="text-xs text-zinc-400 mb-3">{template.description}</p>
                      <div className="text-xs text-zinc-500">
                        {template.agents.length} agents • {template.tasks.length} tasks
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Empty option */}
              <div className="text-center pt-4">
                <p className="text-zinc-500 text-sm mb-3">or start completely empty</p>
                <Button
                  variant="outline"
                  onClick={() => setSelectedTemplate(null)}
                  className={cn(
                    selectedTemplate === null ? "border-indigo-500 text-indigo-400" : ""
                  )}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create Empty Workspace
                </Button>
              </div>

              <div className="flex justify-end pt-4">
                <Button
                  onClick={() => setStep(2)}
                  disabled={selectedTemplate === null && workspaceName === ''}
                >
                  Next Step
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Configure Workspace */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-xl font-semibold text-white mb-2">Name Your Workspace</h2>
                <p className="text-zinc-400 text-sm">Give your AI team a home</p>
              </div>

              <div className="max-w-md mx-auto">
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Workspace Name
                </label>
                <Input
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  placeholder="My AI Team"
                  className="text-lg py-3"
                />
                <p className="text-xs text-zinc-500 mt-2">
                  You can change this later in workspace settings
                </p>
              </div>

              {selectedTemplate && (
                <div className="max-w-md mx-auto p-4 bg-zinc-800/30 rounded-lg border border-zinc-700">
                  <h4 className="text-sm font-medium text-zinc-300 mb-2">You're deploying:</h4>
                  <div className="flex flex-wrap gap-2">
                    {COMPANY_TEMPLATES.find(t => t.id === selectedTemplate)?.agents.map((agent, i) => (
                      <span key={i} className="px-2 py-1 bg-zinc-700/50 rounded text-xs text-zinc-400">
                        {agent.name} ({agent.role})
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-between pt-4">
                <Button variant="ghost" onClick={() => setStep(1)}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <Button
                  onClick={handleCreateWorkspace}
                  disabled={!workspaceName.trim() || isLoading}
                >
                  {isLoading ? 'Creating...' : 'Create Workspace'}
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Success */}
          {step === 3 && (
            <div className="text-center space-y-6 py-8">
              <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto">
                <Check className="w-10 h-10 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">Workspace Created!</h2>
                <p className="text-zinc-400">
                  {selectedTemplate 
                    ? `Your ${workspaceName} team is ready to go!`
                    : 'Your workspace is ready. Add agents to get started.'}
                </p>
              </div>
              
              <div className="flex justify-center gap-4">
                <Button onClick={handleGoToWorkspaces} size="lg">
                  Go to Workspaces
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}