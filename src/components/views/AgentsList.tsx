import React, { useState, useMemo, useRef, useCallback } from 'react';
import { useStore } from '../../store';
import * as d3 from 'd3';
import { Card, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { Plus, Briefcase, Users as UsersIcon, Trash2 } from 'lucide-react';
import { COMPANY_TEMPLATES } from '../../lib/templates';
import { ReactFlow, Background, Controls } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { AgentNode } from './AgentNode';
import { CustomSelect, SelectItem } from '../ui/CustomSelect';
import { MultiSelect } from '../ui/MultiSelect';

export function AgentsList() {
  const { agents, addAgent, removeAgent, updateAgent, applyTemplate, addLog } = useStore();
  const [showAdd, setShowAdd] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const [newAgentRole, setNewAgentRole] = useState('Developer');
  const [newAgentParent, setNewAgentParent] = useState('');
  const [newAgentCollabs, setNewAgentCollabs] = useState<string[]>([]);
  
  const nodeTypes = useMemo(() => ({ agent: AgentNode }), []);

  const handleAddSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    addAgent({
      name: formData.get('name') as string,
      model: formData.get('model') as string,
      role: newAgentRole as any,
      parentId: newAgentParent || undefined,
      status: 'Idle',
      description: formData.get('description') as string,
      skills: (formData.get('skills') as string).split(',').map(s => s.trim()),
      collaborators: newAgentCollabs
    });
    
    addLog({
      agentId: 'system',
      action: 'Agent Onboarded',
      details: `${formData.get('name')} joined the company.`,
      type: 'info'
    });
    setShowAdd(false);
  };

  const { rfNodes, rfEdges } = useMemo(() => {
    if (agents.length === 0) return { rfNodes: [], rfEdges: [] };

    const rootData = {
      id: 'company-root',
      name: 'Company Hub',
      role: 'System',
      isRoot: true,
      parentId: null,
      collaborators: []
    };

    const validAgentIds = new Set(agents.map(a => a.id));

    const allNodes = [
      rootData,
      ...agents.map(a => ({
        ...a,
        parentId: (a.parentId && validAgentIds.has(a.parentId)) ? a.parentId : 'company-root'
      }))
    ];

    const visited = new Set();
    const stack = new Set();
    const breakCycle = (nodeId: string) => {
      if (stack.has(nodeId)) return true;
      if (visited.has(nodeId)) return false;
      visited.add(nodeId);
      stack.add(nodeId);
      const node = allNodes.find(n => n.id === nodeId);
      if (node && node.parentId && node.parentId !== 'company-root') {
        if (breakCycle(node.parentId)) node.parentId = 'company-root';
      }
      stack.delete(nodeId);
      return false;
    };
    allNodes.forEach(n => breakCycle(n.id));

    let hierarchy;
    try {
      hierarchy = d3.stratify<any>().id(d => d.id).parentId(d => d.parentId)(allNodes);
    } catch (e) {
       allNodes.forEach(n => { if(n.id !== 'company-root') n.parentId = 'company-root'; });
       hierarchy = d3.stratify<any>().id(d => d.id).parentId(d => d.parentId)(allNodes);
    }
    
    const treeLayout = d3.tree<any>().nodeSize([300, 250]);
    const root = treeLayout(hierarchy);

    const nodes = root.descendants();
    const links = root.links();

    const horizontalLinks: { source: any, target: any }[] = [];
    agents.forEach(agent => {
      if (agent.collaborators && agent.collaborators.length > 0) {
        const sourceNode = nodes.find(n => n.data.id === agent.id);
        agent.collaborators.forEach(collabId => {
           const targetNode = nodes.find(n => n.data.id === collabId);
           if (sourceNode && targetNode && sourceNode.data.id !== targetNode.data.id) {
             const existing = horizontalLinks.find(l => 
                (l.source.data.id === sourceNode.data.id && l.target.data.id === targetNode.data.id) ||
                (l.source.data.id === targetNode.data.id && l.target.data.id === sourceNode.data.id)
             );
             if (!existing) horizontalLinks.push({ source: sourceNode, target: targetNode });
           }
        });
      }
    });

    const rfNodes = nodes.map(node => ({
       id: node.data.id,
       type: 'agent',
       position: { x: node.x, y: node.y },
       data: { ...node.data, selected: selectedAgentId === node.data.id }
    }));
    
    // Determine relative positioning for horizontal connectors based on x coordinates
    const getHandles = (sx: number, tx: number) => {
       if (sx < tx) return { sourceHandle: 'right', targetHandle: 'left'};
       return { sourceHandle: 'left', targetHandle: 'right'};
    };
    
    const rfEdges = [
       ...links.map((link, i) => ({
           id: `v-${link.source.data.id}-${link.target.data.id}`,
           source: link.source.data.id,
           target: link.target.data.id,
           sourceHandle: 'bottom',
           targetHandle: 'top',
           type: 'smoothstep',
           style: { stroke: 'rgba(161, 161, 170, 0.4)', strokeWidth: 1.5, strokeDasharray: '4 4' }
       })),
       ...horizontalLinks.map((link, i) => {
           const handles = getHandles(link.source.x, link.target.x);
           return {
               id: `h-${link.source.data.id}-${link.target.data.id}`,
               source: link.source.data.id,
               target: link.target.data.id,
               ...handles,
               type: 'bezier',
               style: { stroke: 'rgba(99, 102, 241, 0.5)', strokeWidth: 2, strokeDasharray: '4 4' }
           }
       })
    ];

    return { rfNodes, rfEdges };
  }, [agents, selectedAgentId]);

  const onConnect = useCallback((connection: any) => {
    const { source, target, sourceHandle, targetHandle } = connection;
    if (source === target) return;

    if ((sourceHandle === 'bottom' && targetHandle === 'top') || (sourceHandle === 'top' && targetHandle === 'bottom')) {
       const parentConfig = sourceHandle === 'bottom' ? source : target;
       const childConfig = sourceHandle === 'bottom' ? target : source;
       if (childConfig === 'company-root') return;
       updateAgent(childConfig, { parentId: parentConfig === 'company-root' ? undefined : parentConfig });
       addLog({ agentId: 'system', action: 'Hierarchy Changed', details: `Assigned new manager.`, type: 'info' });
       return;
    } 
    
    if ((sourceHandle === 'right' || sourceHandle === 'left') && (targetHandle === 'left' || targetHandle === 'right')) {
       if (source === 'company-root' || target === 'company-root') return;
       const sourceAgent = agents.find(a => a.id === source);
       if (sourceAgent) {
          const newCollabs = new Set(sourceAgent.collaborators || []);
          if (newCollabs.has(target)) {
             newCollabs.delete(target); // Toggle connection off if existed
          } else {
             newCollabs.add(target);
          }
          updateAgent(source, { collaborators: Array.from(newCollabs) });
          addLog({ agentId: 'system', action: 'Collaboration Changed', details: `Updated horizontal connections.`, type: 'info' });
       }
    }
  }, [agents, updateAgent, addLog]);

  const onNodeClick = useCallback((_: any, node: any) => {
     if (node.id !== 'company-root') setSelectedAgentId(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
     setSelectedAgentId(null);
  }, []);

  const selectedAgent = agents.find(a => a.id === selectedAgentId);

  return (
    <div className="h-full flex flex-col space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 flex-none shrink-0 border-b border-zinc-800 pb-4">
        <div>
          <h2 className="text-xs uppercase font-bold tracking-widest text-zinc-500">Agent Workforce & Hierarchy</h2>
          <p className="text-sm text-zinc-400 mt-1">Manage AI employees, hierarchies, and collaborative connections.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowTemplates(true)}>
            <Briefcase className="mr-2 h-4 w-4" />
            Templates
          </Button>
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Onboard Agent
          </Button>
        </div>
      </div>

      <div className="flex-1 flex gap-6 overflow-hidden">
        <div 
          ref={containerRef}
          className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden relative group"
        >
          {agents.length === 0 ? (
             <div className="absolute inset-0 flex items-center justify-center text-zinc-500 text-sm">
               No agents to display. Open Templates to hire a complete team.
             </div>
          ) : (
             <ReactFlow 
                nodes={rfNodes}
                edges={rfEdges}
                nodeTypes={nodeTypes}
                onConnect={onConnect}
                onNodeClick={onNodeClick}
                onPaneClick={onPaneClick}
                fitView
                fitViewOptions={{ padding: 0.2 }}
                minZoom={0.1}
                maxZoom={1.5}
                className="bg-zinc-950"
             >
                <Background color="#3f3f46" gap={24} size={1} />
                <Controls className="!bg-zinc-900 border !border-zinc-800 !fill-white opacity-0 group-hover:opacity-100 transition-opacity" showInteractive={false} />
             </ReactFlow>
          )}
        </div>

        {selectedAgent && (
          <div className="w-80 border border-zinc-800 rounded-xl bg-zinc-900 flex flex-col shrink-0 overflow-y-auto animate-in slide-in-from-right-4 duration-300">
             <div className="p-4 border-b border-zinc-800 flex justify-between items-start sticky top-0 bg-zinc-900/90 backdrop-blur-sm z-10">
               <h3 className="font-semibold text-zinc-100 flex items-center">
                 <div className="h-6 w-6 bg-zinc-800 text-zinc-300 rounded-full flex items-center justify-center font-bold text-xs mr-2">
                    {selectedAgent.name.substring(0,2).toUpperCase()}
                 </div>
                 {selectedAgent.name}
               </h3>
               <button onClick={() => setSelectedAgentId(null)} className="text-zinc-500 hover:text-white">×</button>
             </div>
             
             <div className="p-4 space-y-6">
                <div className="space-y-1">
                   <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Model</label>
                   <p className="text-sm text-zinc-300">{selectedAgent.model}</p>
                </div>
                <div className="space-y-1">
                   <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Role</label>
                   <div><Badge variant="outline">{selectedAgent.role}</Badge></div>
                </div>
                <div className="space-y-1">
                   <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Description</label>
                   <p className="text-sm text-zinc-300">{selectedAgent.description}</p>
                </div>
                
                <div className="pt-4 border-t border-zinc-800 space-y-4">
                   <h4 className="font-medium text-zinc-200">Relationships</h4>
                   
                   <div className="space-y-2">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Manager (Reports To)</label>
                      <CustomSelect 
                         value={selectedAgent.parentId || ''}
                         onValueChange={(val: string) => updateAgent(selectedAgent.id, { parentId: val === 'root' ? undefined : val })}
                         placeholder="Select a manager"
                      >
                         <SelectItem value="root">No Parent (Root Hub)</SelectItem>
                         {agents.filter(a => a.id !== selectedAgent.id).map(a => (
                            <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                         ))}
                      </CustomSelect>
                   </div>

                   <div className="space-y-2">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center justify-between">
                         Collaborators (info sharing)
                      </label>
                      <MultiSelect 
                         options={agents.filter(a => a.id !== selectedAgent.id).map(a => ({ value: a.id, label: `${a.name} (${a.role})` }))}
                         value={selectedAgent.collaborators || []}
                         onChange={(values: string[]) => updateAgent(selectedAgent.id, { collaborators: values })}
                         placeholder="Select collaborators"
                      />
                      <p className="text-xs text-zinc-500 mt-1 leading-tight">These agents exchange context horizontally.</p>
                   </div>
                </div>

                <div className="pt-4 border-t border-zinc-800 space-y-4">
                   <h4 className="font-medium text-zinc-200">Telegram Integration</h4>
                   <div className="space-y-2">
                       <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Bot Token</label>
                       <Input 
                          type="password"
                          placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11" 
                          value={selectedAgent.telegramConfig?.botToken || ''}
                          onChange={(e) => {
                              updateAgent(selectedAgent.id, { 
                                 telegramConfig: { 
                                    ...(selectedAgent.telegramConfig || { status: 'disconnected' }),
                                    botToken: e.target.value,
                                    status: e.target.value ? (selectedAgent.telegramConfig?.status || 'disconnected') : 'disconnected'
                                 } 
                              });
                          }}
                          className="bg-zinc-950 font-mono text-xs"
                       />
                       <p className="text-xs text-zinc-500 leading-tight">Create a bot in @BotFather, paste the token here, and you can chat with {selectedAgent.name} directly from Telegram.</p>
                       
                       {selectedAgent.telegramConfig?.botToken && (
                           <div className="mt-2 flex flex-col gap-2 bg-zinc-950 p-2 rounded-md border border-zinc-800">
                               <div className="flex items-center justify-between">
                                 <div className="flex items-center gap-2 text-xs">
                                    <div className={`w-2 h-2 rounded-full ${selectedAgent.telegramConfig.status === 'running' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : selectedAgent.telegramConfig.status === 'error' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-zinc-600'}`}></div>
                                    <span className="text-zinc-300 font-medium capitalize">{selectedAgent.telegramConfig.status}</span>
                                 </div>
                                 {selectedAgent.telegramConfig.lastError && (
                                    <span className="text-[10px] text-red-400 truncate max-w-[120px]" title={selectedAgent.telegramConfig.lastError}>
                                       {selectedAgent.telegramConfig.lastError}
                                    </span>
                                 )}
                               </div>
                               
                               {selectedAgent.telegramConfig.status === 'running' && (
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    className="w-full text-xs h-7"
                                    onClick={async () => {
                                       if (selectedAgent.telegramConfig?.lastChatId) {
                                          try {
                                             await fetch(`https://api.telegram.org/bot${selectedAgent.telegramConfig.botToken}/sendMessage`, {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({
                                                   chat_id: selectedAgent.telegramConfig.lastChatId,
                                                   text: `Hello! I am ${selectedAgent.name}, your AI agent. Connection is working normally.`
                                                })
                                             });
                                             addLog({ agentId: 'system', action: 'Telegram Test', details: 'Sent test message to Telegram.', type: 'success' });
                                          } catch (e: any) {
                                             addLog({ agentId: 'system', action: 'Telegram Test Failed', details: e.message, type: 'error' });
                                          }
                                       } else {
                                          addLog({ agentId: 'system', action: 'Telegram Setup', details: 'Please send me a message in Telegram first so I know your chat ID.', type: 'warning' });
                                       }
                                    }}
                                  >
                                    Send Test Message to Telegram
                                  </Button>
                               )}
                           </div>
                       )}
                   </div>
                </div>

                <div className="pt-4 border-t border-zinc-800">
                   <Button variant="destructive" className="w-full flex justify-center items-center gap-2 bg-red-950/50 hover:bg-red-900 border border-red-900/50 text-red-200" onClick={() => {
                        removeAgent(selectedAgent.id);
                        setSelectedAgentId(null);
                        addLog({ agentId: 'system', action: 'Agent Removed', details: `${selectedAgent.name} left the company.`, type: 'warning' });
                   }}>
                      <Trash2 size={16} /> Retire Agent
                   </Button>
                </div>
             </div>
          </div>
        )}
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0" onClick={() => setShowAdd(false)} />
          <div className="relative w-full max-w-2xl bg-zinc-950 border border-zinc-800 xl:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-zinc-800 flex justify-between items-start bg-zinc-900/40 shrink-0">
              <div>
                <h3 className="text-xl font-semibold text-zinc-100">Onboard New Agent</h3>
                <p className="text-sm text-zinc-500 mt-1 mb-0">Configure connecting via API & assign role.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)} className="rounded-full w-8 h-8 p-0 flex items-center justify-center -mt-2 -mr-2">×</Button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              <form id="add-agent-form" onSubmit={handleAddSubmit} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Name</label>
                    <Input name="name" required placeholder="e.g. CodeLlama Assistant" className="bg-zinc-900 shadow-inner border-zinc-800" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Model / Engine</label>
                    <Input name="model" required placeholder="e.g. OpenClaw, Codex" className="bg-zinc-900 shadow-inner border-zinc-800" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Role</label>
                    <CustomSelect value={newAgentRole} onValueChange={setNewAgentRole} placeholder="Select a role">
                      <SelectItem value="Developer">Developer</SelectItem>
                      <SelectItem value="Manager">Manager</SelectItem>
                      <SelectItem value="Reviewer">Reviewer</SelectItem>
                      <SelectItem value="Analyst">Analyst</SelectItem>
                      <SelectItem value="Designer">Designer</SelectItem>
                    </CustomSelect>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Manager (Reports To)</label>
                    <CustomSelect value={newAgentParent} onValueChange={setNewAgentParent} placeholder="Select a manager">
                      <SelectItem value="">No Parent (Root Hub)</SelectItem>
                      {agents.map(a => (
                        <SelectItem key={a.id} value={a.id}>{a.name} ({a.role})</SelectItem>
                      ))}
                    </CustomSelect>
                  </div>
                  <div className="space-y-2 sm:col-span-2 text-zinc-300">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Collaborators (Optional)</label>
                      <MultiSelect 
                         options={agents.map(a => ({ value: a.id, label: `${a.name} ({a.role})` }))}
                         value={newAgentCollabs}
                         onChange={setNewAgentCollabs}
                         placeholder="Select collaborators"
                      />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Skills (comma separated)</label>
                    <Input name="skills" required placeholder="React, Node.js, Planning" className="bg-zinc-900 shadow-inner border-zinc-800" />
                  </div>
                  <div className="space-y-2 flex flex-col sm:col-span-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Description</label>
                    <textarea
                      name="description"
                      required
                      rows={3}
                      className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus-visible:outline-none shadow-inner focus-visible:ring-1 focus-visible:ring-indigo-500 focus-visible:border-indigo-500"
                      placeholder="Agent responsibilities..."
                    />
                  </div>
                </div>
              </form>
            </div>
            
            <div className="p-6 border-t border-zinc-800 bg-zinc-950 flex justify-end gap-3 shrink-0">
              <Button variant="ghost" type="button" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button type="submit" form="add-agent-form" className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/25">Hire Agent</Button>
            </div>
          </div>
        </div>
      )}

      {showTemplates && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
           <div className="absolute inset-0" onClick={() => setShowTemplates(false)} />
           <div className="relative w-full max-w-5xl bg-zinc-950 border border-zinc-800 xl:rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
             <div className="p-6 border-b border-zinc-800 flex justify-between items-start bg-zinc-900/40 shrink-0">
                <div>
                   <h3 className="text-xl font-semibold text-zinc-100">Ready-Made Teams</h3>
                   <p className="text-sm text-zinc-500 mt-1 mb-0">Instantly deploy a fully configured AI workforce tailored to your needs.</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setShowTemplates(false)} className="rounded-full w-8 h-8 p-0 flex items-center justify-center -mt-2 -mr-2">×</Button>
             </div>

             <div className="p-6 overflow-y-auto">
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                   {COMPANY_TEMPLATES.map(template => (
                      <Card key={template.id} className="flex flex-col bg-zinc-900 border-zinc-800 relative group overflow-hidden">
                         <div className="absolute inset-0 bg-indigo-500/0 transition-colors duration-300 group-hover:bg-indigo-500/5 pointer-events-none" />
                         <CardContent className="p-5 flex-1 space-y-4">
                            <div className="flex items-start gap-4">
                               <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 shadow-inner flex items-center justify-center text-indigo-400 shrink-0">
                                  <Briefcase className="h-5 w-5" />
                               </div>
                               <div>
                                  <h3 className="text-base font-semibold text-zinc-100">{template.name}</h3>
                                  <p className="text-xs text-zinc-400 leading-relaxed mt-1 line-clamp-2">{template.description}</p>
                               </div>
                            </div>

                            <div className="pt-2 border-t border-zinc-800/50">
                               <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                                  <UsersIcon size={12} /> Team Composition
                               </h4>
                               <div className="flex flex-col gap-1.5 pl-1 border-l-2 border-zinc-800">
                                  {template.agents.map((agent, i) => (
                                     <div key={i} className="flex justify-between items-center pl-2">
                                        <span className="text-xs text-zinc-300 font-medium">{agent.name}</span>
                                        <span className="text-[10px] text-zinc-500">{agent.role}</span>
                                     </div>
                                  ))}
                               </div>
                            </div>
                         </CardContent>
                         <div className="p-5 pt-0 mt-auto">
                            <Button 
                               className="w-full bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600 hover:text-white transition-all shadow-none group-hover:shadow-[0_0_15px_rgba(79,70,229,0.3)]"
                               onClick={() => {
                                  applyTemplate(template);
                                  setShowTemplates(false);
                               }}
                            >
                               Deploy {template.name}
                            </Button>
                         </div>
                      </Card>
                   ))}
                </div>
             </div>
           </div>
        </div>
      )}
    </div>
  );
}
