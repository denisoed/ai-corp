import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useStore } from '../../store';
import * as d3 from 'd3';
import { Card, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { FolderPicker } from '../ui/FolderPicker';
import { Plus, Briefcase, Users as UsersIcon, Trash2, X, User, Link2, MessageCircle, AlertTriangle, FolderKanban, FileText, Pencil, Check } from 'lucide-react';
import { COMPANY_TEMPLATES } from '../../lib/templates';
import { ReactFlow, Background, Controls, Node, Edge, useNodesState, useEdgesState } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { AgentNode } from './AgentNode';
import { CustomSelect, SelectItem } from '../ui/CustomSelect';
import { MultiSelect } from '../ui/MultiSelect';
import { Tabs, TabPanel } from '../ui/Tabs';
import { cn } from '../../lib/utils';

const WORKSPACE_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f97316', '#14b8a6', '#22c55e', '#3b82f6', '#eab308'
];

const DEFAULT_COLOR = '#6366f1';

interface WorkspaceGroupNode {
  id: string;
  type: 'workspaceGroup';
  position: { x: number; y: number };
  data: {
    workspaceId: string;
    name: string;
    color: string;
    agentCount: number;
  };
}

function WorkspaceGroupNodeComponent({ data }: { data: any }) {
  return (
    <div
      className="rounded-xl border-2 flex flex-col items-center text-center gap-2 p-4"
      style={{
        width: data.width || 256,
        height: data.height || 'auto',
        backgroundColor: `${data.color}15`,
        borderColor: `${data.color}60`,
      }}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center"
        style={{ backgroundColor: `${data.color}30` }}
      >
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: data.color }} />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-zinc-100">{data.name}</h3>
        <p className="text-xs text-zinc-500">{data.agentCount} agent{data.agentCount !== 1 ? 's' : ''}</p>
      </div>
    </div>
  );
}

function computeTree(wsAgents: any[], rootId: string) {
  const validAgentIds = new Set(wsAgents.map(a => a.id));
  const rootData = {
    id: rootId,
    name: 'System',
    role: 'System',
    isRoot: true,
    parentId: null,
    collaborators: [],
    workspaceId: '__internal__'
  };
  const allNodes = [
    rootData,
    ...wsAgents.map(a => ({
      ...a,
      parentId: (a.parentId && validAgentIds.has(a.parentId)) ? a.parentId : rootId
    }))
  ];

  const visited = new Set<string>();
  const stack = new Set<string>();
  const breakCycle = (nodeId: string): boolean => {
    if (stack.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    visited.add(nodeId);
    stack.add(nodeId);
    const node = allNodes.find(n => n.id === nodeId);
    if (node && node.parentId) {
      if (breakCycle(node.parentId)) node.parentId = rootId;
    }
    stack.delete(nodeId);
    return false;
  };
  allNodes.forEach(n => breakCycle(n.id));

  let hierarchy;
  try {
    hierarchy = d3.stratify<any>().id(d => d.id).parentId(d => d.parentId)(allNodes);
  } catch {
    allNodes.forEach(n => { if (n.id !== rootId) n.parentId = rootId; });
    hierarchy = d3.stratify<any>().id(d => d.id).parentId(d => d.parentId)(allNodes);
  }

  const treeLayout = d3.tree<any>().nodeSize([260, 220]);
  const root = treeLayout(hierarchy);
  return { desc: root.descendants(), links: root.links() };
}

export function WorkspacesList() {
  const { agents, workspaces, addAgent, removeAgent, updateAgent, addWorkspace, updateWorkspace, removeWorkspace, assignAgentToWorkspace, applyTemplate, initWorkspaceFromYml, addLog } = useStore();
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [showInitYml, setShowInitYml] = useState(false);
  const [initYmlFolder, setInitYmlFolder] = useState('');
  const [showWorkspaceSettings, setShowWorkspaceSettings] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [newAgentSlug, setNewAgentSlug] = useState('');
  const [newAgentParent, setNewAgentParent] = useState('');
  const [settingsFolderPath, setSettingsFolderPath] = useState('');
  const [newAgentCollabs, setNewAgentCollabs] = useState<string[]>([]);
  const [newAgentWorkspace, setNewAgentWorkspace] = useState('');
  const [newAgentSoul, setNewAgentSoul] = useState('');
  const [newAgentIdentity, setNewAgentIdentity] = useState('');
  const [newAgentRoleDoc, setNewAgentRoleDoc] = useState('');
  const [formTab, setFormTab] = useState<'basic' | 'personality'>('basic');
  const [personalityFiles, setPersonalityFiles] = useState<Record<string, string> | null>(null);
  const [editingFile, setEditingFile] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [savingFile, setSavingFile] = useState(false);
  const [savingWorkspace, setSavingWorkspace] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [activeAgentTab, setActiveAgentTab] = useState('info');
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState('settings');

  const [newWsName, setNewWsName] = useState('');
  const [newWsDescription, setNewWsDescription] = useState('');
  const [newWsFolder, setNewWsFolder] = useState('');
  const [newWsColor, setNewWsColor] = useState(DEFAULT_COLOR);
  const [newWsSlug, setNewWsSlug] = useState('');

  useEffect(() => {
    if (selectedAgentId) {
      fetch(`/api/agents/${selectedAgentId}/personality`)
        .then(r => r.json())
        .then(data => {
          if (data.error) {
            setPersonalityFiles(null);
          } else {
            setPersonalityFiles(data);
          }
        })
        .catch(() => setPersonalityFiles(null));
    } else {
      setPersonalityFiles(null);
    }
    setEditingFile(null);
  }, [selectedAgentId]);

  const startEdit = (filename: string) => {
    setEditContent(personalityFiles?.[filename] || '');
    setEditingFile(filename);
  };

  const saveFile = async () => {
    if (!selectedAgentId || !editingFile) return;
    setSavingFile(true);
    try {
      await fetch(`/api/agents/${selectedAgentId}/personality/${editingFile}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent })
      });
      setPersonalityFiles(prev => prev ? { ...prev, [editingFile]: editContent } : null);
      setEditingFile(null);
    } catch (e) {
      console.error('Failed to save', e);
    } finally {
      setSavingFile(false);
    }
  };

  const nodeTypes = useMemo(() => ({
    agent: AgentNode,
    workspaceGroup: WorkspaceGroupNodeComponent
  }), []);

  const selectedWorkspace = workspaces.find(w => w.id === showWorkspaceSettings);
  const selectedAgent = agents.find(a => a.id === selectedAgentId);

  useEffect(() => {
    if (selectedWorkspace) {
      setSettingsFolderPath(selectedWorkspace.folderPath || '');
      setSaveStatus('idle');
    }
  }, [showWorkspaceSettings]);

  useEffect(() => {
    if (!showWorkspaceSettings) {
      setSavingWorkspace(false);
      setSaveStatus('idle');
    }
  }, [showWorkspaceSettings]);

  const layoutNodes = useMemo(() => {
    const nodes: Node[] = [];
    const PAD = 60;
    const WS_GAP = 80;

    const wsAgentsMap = new Map<string, typeof agents>();
    wsAgentsMap.set('__unassigned', []);
    workspaces.forEach(ws => wsAgentsMap.set(ws.id, []));
    agents.forEach(agent => {
      const wsId = agent.workspaceId || '__unassigned';
      if (!wsAgentsMap.has(wsId)) wsAgentsMap.set(wsId, []);
      wsAgentsMap.get(wsId)!.push(agent);
    });

    const unassignedAgents = wsAgentsMap.get('__unassigned') || [];

    const computeWsLayout = (wsId: string, wsName: string, wsColor: string, wsAgents: typeof agents, rootId: string) => {
      if (wsAgents.length === 0) {
        return { wsId, name: wsName, color: wsColor, agentCount: 0, width: 256, height: 100, agents: [] as { id: string; relX: number; relY: number; data: any }[] };
      }

      const { desc } = computeTree(wsAgents, rootId);

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      desc.forEach(node => {
        if (node.data.id === rootId) return;
        minX = Math.min(minX, node.x);
        minY = Math.min(minY, node.y);
        maxX = Math.max(maxX, node.x);
        maxY = Math.max(maxY, node.y);
      });

      const CARD_W = 224;
      const CARD_H = 160;
      const width = Math.max(256, maxX - minX + CARD_W + PAD * 2);
      const height = Math.max(100, maxY - minY + CARD_H + PAD * 2 + 50);
      const offsetX = -minX + PAD;
      const offsetY = -minY + PAD + 50;

      const agents: { id: string; relX: number; relY: number; data: any }[] = [];
      desc.forEach(node => {
        if (node.data.id === rootId) return;
        agents.push({
          id: node.data.id,
          relX: node.x + offsetX,
          relY: node.y + offsetY,
          data: node.data,
        });
      });

      return { wsId, name: wsName, color: wsColor, agentCount: wsAgents.length, width, height, agents };
    };

    const allWsLayouts: ReturnType<typeof computeWsLayout>[] = [];
    workspaces.forEach(ws => {
      const wsAgents = wsAgentsMap.get(ws.id) || [];
      allWsLayouts.push(computeWsLayout(ws.id, ws.name, ws.color || DEFAULT_COLOR, wsAgents, `ws-root-${ws.id}`));
    });

    let flowX = 60;
    let flowY = 60;
    let rowMaxH = 0;
    const MAX_ROW_W = 4000;

    const wsLayoutData: Array<{ wsId: string; name: string; color: string; width: number; height: number; agents: any[]; x: number; y: number }> = [];

    allWsLayouts.forEach((layout, i) => {
      if (i > 0 && flowX + layout.width > MAX_ROW_W) {
        flowX = 60;
        flowY += rowMaxH + WS_GAP;
        rowMaxH = 0;
      }

      wsLayoutData.push({
        wsId: layout.wsId,
        name: layout.name,
        color: layout.color,
        width: layout.width,
        height: layout.height,
        agents: layout.agents,
        x: flowX,
        y: flowY
      });

      flowX += layout.width + WS_GAP;
      rowMaxH = Math.max(rowMaxH, layout.height);
    });

    wsLayoutData.forEach(layout => {
      nodes.push({
        id: `ws-${layout.wsId}`,
        type: 'workspaceGroup',
        position: { x: layout.x, y: layout.y },
        draggable: true,
        zIndex: 0,
        data: {
          workspaceId: layout.wsId,
          name: layout.name,
          color: layout.color,
          agentCount: layout.agents.length,
          width: layout.width,
          height: layout.height,
          zIndex: 0
        }
      });

      layout.agents.forEach(a => {
        nodes.push({
          id: a.id,
          type: 'agent',
          position: { x: layout.x + a.relX, y: layout.y + a.relY },
          draggable: true,
          zIndex: 1,
          data: { ...a.data, selected: selectedAgentId === a.id, workspaceColor: layout.color }
        });
      });
    });

    if (unassignedAgents.length > 0) {
      const unassignedY = flowY + rowMaxH + WS_GAP;
      const layout = computeWsLayout('__unassigned', 'Unassigned', '#52525b', unassignedAgents, 'unassigned-root');

      nodes.push({
        id: 'ws-unassigned',
        type: 'workspaceGroup',
        position: { x: 60, y: unassignedY },
        draggable: true,
        zIndex: 0,
        data: {
          workspaceId: '__unassigned',
          name: 'Unassigned',
          color: '#52525b',
          agentCount: layout.agents.length,
          width: layout.width,
          height: layout.height,
          zIndex: 0
        }
      });

      layout.agents.forEach(a => {
        nodes.push({
          id: a.id,
          type: 'agent',
          position: { x: 60 + a.relX, y: unassignedY + a.relY },
          draggable: true,
          zIndex: 1,
          data: { ...a.data, selected: selectedAgentId === a.id, workspaceColor: '#52525b' }
        });
      });
    }

    return nodes;
  }, [agents, workspaces]);

  const layoutEdges = useMemo(() => {
    const edges: Edge[] = [];
    const wsAgentsMap = new Map<string, typeof agents>();
    wsAgentsMap.set('__unassigned', []);
    workspaces.forEach(ws => wsAgentsMap.set(ws.id, []));
    agents.forEach(agent => {
      const wsId = agent.workspaceId || '__unassigned';
      if (!wsAgentsMap.has(wsId)) wsAgentsMap.set(wsId, []);
      wsAgentsMap.get(wsId)!.push(agent);
    });

    workspaces.forEach(ws => {
      const wsAgents = wsAgentsMap.get(ws.id) || [];

      const { desc, links } = computeTree(wsAgents, `ws-root-${ws.id}`);

      links.forEach(link => {
        if (link.source.data.id === `ws-root-${ws.id}`) return;
        edges.push({
          id: `e-${link.source.data.id}-${link.target.data.id}`,
          source: link.source.data.id,
          target: link.target.data.id,
          sourceHandle: 'bottom',
          targetHandle: 'top',
          type: 'smoothstep',
          style: { stroke: 'rgba(161, 161, 170, 0.4)', strokeWidth: 1.5, strokeDasharray: '4 4' }
        });
      });

      const horizontalLinks: { source: any, target: any }[] = [];
      wsAgents.forEach(agent => {
        if (agent.collaborators && agent.collaborators.length > 0) {
          const sourceNode = desc.find(n => n.data.id === agent.id);
          agent.collaborators.forEach(collabId => {
            const targetNode = desc.find(n => n.data.id === collabId);
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

      horizontalLinks.forEach(link => {
        const sx = desc.find(n => n.data.id === link.source.data.id)?.x || 0;
        const tx = desc.find(n => n.data.id === link.target.data.id)?.x || 0;
        const handles = sx < tx ? { sourceHandle: 'right', targetHandle: 'left' } : { sourceHandle: 'left', targetHandle: 'right' };
        edges.push({
          id: `h-${link.source.data.id}-${link.target.data.id}`,
          source: link.source.data.id,
          target: link.target.data.id,
          ...handles,
          type: 'bezier',
          style: { stroke: 'rgba(99, 102, 241, 0.5)', strokeWidth: 2, strokeDasharray: '4 4' }
        });
      });
    });

    const unassignedAgents = wsAgentsMap.get('__unassigned') || [];
    if (unassignedAgents.length > 0) {
      const { links } = computeTree(unassignedAgents, 'unassigned-root');
      links.forEach(link => {
        if (link.source.data.id === 'unassigned-root') return;
        edges.push({
          id: `e-u-${link.source.data.id}-${link.target.data.id}`,
          source: link.source.data.id,
          target: link.target.data.id,
          sourceHandle: 'bottom',
          targetHandle: 'top',
          type: 'smoothstep',
          style: { stroke: 'rgba(161, 161, 170, 0.4)', strokeWidth: 1.5, strokeDasharray: '4 4' }
        });
      });
    }

    return edges;
  }, [agents, workspaces]);

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutEdges);

  const prevAgentWsRef = useRef<string>('');

  useEffect(() => {
    const agentWsKey = agents.map(a => `${a.id}:${a.workspaceId}`).sort().join(',') + '|' + workspaces.map(w => w.id).sort().join(',');
    if (agentWsKey !== prevAgentWsRef.current) {
      setNodes(layoutNodes);
      prevAgentWsRef.current = agentWsKey;
    }
  }, [agents, workspaces, layoutNodes, setNodes]);

  useEffect(() => {
    setEdges(layoutEdges);
  }, [layoutEdges, setEdges]);

  useEffect(() => {
    setNodes(nodes => nodes.map(n => {
      if (n.type === 'agent') {
        const isSelected = n.id === selectedAgentId;
        if (n.data.selected !== isSelected) {
          return { ...n, data: { ...n.data, selected: isSelected } };
        }
      }
      return n;
    }));
  }, [selectedAgentId, setNodes]);

  const onNodeDrag = useCallback((_: any, node: any) => {
    if (node.type !== 'agent') return;
    const agent = agents.find(a => a.id === node.id);
    if (!agent || !agent.workspaceId) return;

    const wsNodeId = `ws-${agent.workspaceId}`;
    const PAD = 60;
    const CARD_W = 224;
    const CARD_H = 160;

    setNodes((nds: any) => nds.map(n => {
      if (n.id !== wsNodeId) return n;
      const ws = n.position;
      const np = node.position;
      const newW = Math.max((n.data.width as number) || 256, Math.max(np.x - ws.x + CARD_W + PAD, ws.x + (n.data.width || 256) - ws.x));
      const newH = Math.max((n.data.height as number) || 100, Math.max(np.y - ws.y + CARD_H + PAD, ws.y + (n.data.height || 100) - ws.y));
      if (newW !== n.data.width || newH !== n.data.height) {
        return { ...n, data: { ...n.data, width: newW, height: newH } };
      }
      return n;
    }));
  }, [agents, setNodes]);

  const onNodeDragStop = useCallback((_: any, node: any) => {
    if (node.type !== 'agent') return;
    const agent = agents.find(a => a.id === node.id);
    if (!agent) return;

    const wsNodes = nodes.filter(n => n.type === 'workspaceGroup');
    const draggedPos = node.position;
    let landedInWs: string | undefined;

    for (const wsNode of wsNodes) {
      const wsPos = wsNode.position;
      const wsW = (wsNode.data as any).width || 256;
      const wsH = (wsNode.data as any).height || 100;
      if (
        draggedPos.x >= wsPos.x && draggedPos.x <= wsPos.x + wsW &&
        draggedPos.y >= wsPos.y && draggedPos.y <= wsPos.y + wsH
      ) {
        landedInWs = (wsNode.data as any).workspaceId;
        break;
      }
    }

    if (landedInWs === '__unassigned') {
      if (agent.workspaceId) assignAgentToWorkspace(agent.id, undefined);
      return;
    }

    if (landedInWs && landedInWs !== agent.workspaceId) {
      assignAgentToWorkspace(agent.id, landedInWs);
      return;
    }

    if (!landedInWs && agent.workspaceId) {
      assignAgentToWorkspace(agent.id, undefined);
      return;
    }

    if (landedInWs === agent.workspaceId && agent.workspaceId) {
      const PAD = 60;
      const CARD_W = 224;
      const CARD_H = 160;
      const wsNodeId = `ws-${agent.workspaceId}`;
      setNodes((nds: any) => nds.map(n => {
        if (n.id !== wsNodeId) return n;
        const ws = n.position;
        const np = node.position;
        const newW = Math.max((n.data.width as number) || 256, np.x - ws.x + CARD_W + PAD);
        const newH = Math.max((n.data.height as number) || 100, np.y - ws.y + CARD_H + PAD);
        if (newW !== n.data.width || newH !== n.data.height) {
          return { ...n, data: { ...n.data, width: newW, height: newH } };
        }
        return n;
      }));
    }
  }, [agents, nodes, assignAgentToWorkspace, setNodes]);

  const onConnect = useCallback((connection: any) => {
    const { source, target, sourceHandle, targetHandle } = connection;
    if (source === target) return;

    if ((sourceHandle === 'bottom' && targetHandle === 'top') || (sourceHandle === 'top' && targetHandle === 'bottom')) {
      const parentConfig = sourceHandle === 'bottom' ? source : target;
      const childConfig = sourceHandle === 'bottom' ? target : source;
      if (childConfig === 'company-root' || childConfig.startsWith('ws-') || childConfig.startsWith('unassigned')) return;

      setEdges((eds: any) => [...eds, {
        id: `e-${source}-${target}`,
        source, target,
        sourceHandle: 'bottom', targetHandle: 'top',
        type: 'smoothstep',
        style: { stroke: 'rgba(161, 161, 170, 0.4)', strokeWidth: 1.5, strokeDasharray: '4 4' }
      }]);

      updateAgent(childConfig, { parentId: parentConfig === 'company-root' ? undefined : parentConfig }).catch(e => console.error('Failed to update agent parent:', e));
      return;
    }

    if ((sourceHandle === 'right' || sourceHandle === 'left') && (targetHandle === 'left' || targetHandle === 'right')) {
      if (source === 'company-root' || target === 'company-root' || source.startsWith('ws-') || target.startsWith('ws-')) return;
      const sourceAgent = agents.find(a => a.id === source);
      if (sourceAgent) {
        const newCollabs = new Set(sourceAgent.collaborators || []);
        const isRemoving = newCollabs.has(target);
        if (isRemoving) {
          newCollabs.delete(target);
        } else {
          newCollabs.add(target);
        }

        if (!isRemoving) {
          const handles = sourceHandle === 'right' ? { sourceHandle: 'right', targetHandle: 'left' } : { sourceHandle: 'left', targetHandle: 'right' };
          setEdges((eds: any) => [...eds, {
            id: `h-${source}-${target}`,
            source, target,
            ...handles,
            type: 'bezier',
            style: { stroke: 'rgba(99, 102, 241, 0.5)', strokeWidth: 2, strokeDasharray: '4 4' }
          }]);
        } else {
          setEdges((eds: any) => eds.filter((e: any) => e.id !== `h-${source}-${target}`));
        }

        updateAgent(source, { collaborators: Array.from(newCollabs) }).catch(e => console.error('Failed to update agent collaborators:', e));
      }
    }
  }, [agents, updateAgent, setEdges]);

  const onNodeClick = useCallback((_: any, node: any) => {
    if (node.id.startsWith('ws-') || node.id.startsWith('unassigned')) {
      const wsId = node.data.workspaceId;
      if (wsId === '__unassigned') return;
      setShowWorkspaceSettings(wsId);
    } else {
      setSelectedAgentId(node.id);
    }
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedAgentId(null);
    setShowWorkspaceSettings(null);
  }, []);

  const handleInitYml = async () => {
    if (!initYmlFolder) return;
    try {
      await initWorkspaceFromYml(initYmlFolder);
      setShowInitYml(false);
      setInitYmlFolder('');
    } catch (e: any) {
      alert(e?.message || 'Failed to init from .aicorp.yml');
    }
  };

  const handleCreateWorkspace = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWsName.trim()) return;
    addWorkspace({
      name: newWsName,
      slug: newWsSlug || newWsName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      description: newWsDescription,
      folderPath: newWsFolder || undefined,
      color: newWsColor
    });
    addLog({ agentId: 'system', action: 'Workspace Created', details: `Created workspace: ${newWsName}`, type: 'success' });
    setNewWsName('');
    setNewWsDescription('');
    setNewWsFolder('');
    setNewWsColor(DEFAULT_COLOR);
    setNewWsSlug('');
    setShowCreateWorkspace(false);
  };

  const handleAddAgent = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    addAgent({
      name: formData.get('name') as string,
      slug: (formData.get('slug') as string) || (formData.get('name') as string).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      parentId: newAgentParent || undefined,
      status: 'Idle',
      skills: (formData.get('skills') as string).split(',').map(s => s.trim()).filter(Boolean),
      collaborators: newAgentCollabs,
      workspaceId: newAgentWorkspace || undefined,
      soul: newAgentSoul || undefined,
      identity: newAgentIdentity || undefined,
      roleDoc: newAgentRoleDoc || undefined,
    });
    addLog({
      agentId: 'system',
      action: 'Agent Onboarded',
      details: `${formData.get('name')} joined${newAgentWorkspace ? ` workspace ${workspaces.find(w => w.id === newAgentWorkspace)?.name}` : ''}.`,
      type: 'info'
    });
    setNewAgentSoul('');
    setNewAgentIdentity('');
    setNewAgentRoleDoc('');
    setNewAgentSlug('');
    setShowAddAgent(false);
  };

  const handleApplyTemplate = (template: any) => {
    applyTemplate(template);
    setShowTemplates(false);
  };

  return (
    <div className="h-full flex flex-col space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 flex-none shrink-0 border-b border-zinc-800 pb-4">
        <div>
          <h2 className="text-xs uppercase font-bold tracking-widest text-zinc-500">Workspaces</h2>
          <p className="text-sm text-zinc-400 mt-1">Organize agents into workspaces with shared settings and folder paths.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowInitYml(true)}>
            <FileText className="mr-2 h-4 w-4" />
            Init from .aicorp.yml
          </Button>
          <Button variant="outline" onClick={() => setShowTemplates(true)}>
            <Briefcase className="mr-2 h-4 w-4" />
            Templates
          </Button>
          <Button variant="outline" onClick={() => setShowCreateWorkspace(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Workspace
          </Button>
          <Button onClick={() => setShowAddAgent(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Onboard Agent
          </Button>
        </div>
      </div>

      <div className="flex-1 flex gap-6 overflow-hidden">
        <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden relative group">
          {agents.length === 0 && workspaces.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center text-zinc-500 text-sm">
              No agents yet. Create a workspace or use Templates to get started.
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              onNodeDrag={onNodeDrag}
              onNodeDragStop={onNodeDragStop}
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
                  {selectedAgent.name.substring(0, 2).toUpperCase()}
                </div>
                {selectedAgent.name}
              </h3>
              <button onClick={() => setSelectedAgentId(null)} className="text-zinc-500 hover:text-white">×</button>
            </div>

            <Tabs
              tabs={[
                { id: 'info', label: 'Info', icon: <User size={14} /> },
                { id: 'personality', label: 'Personality', icon: <FileText size={14} /> },
                { id: 'relationships', label: 'Team', icon: <Link2 size={14} /> },
                { id: 'telegram', label: 'Telegram', icon: <MessageCircle size={14} /> },
              ]}
              activeTab={activeAgentTab}
              onTabChange={setActiveAgentTab}
              className="px-4"
            />

            <div className="p-4 flex-1 overflow-y-auto">
              <TabPanel id="info" activeTab={activeAgentTab} className="space-y-4">
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Name</label>
                    <Input
                      value={selectedAgent.name}
                      onChange={(e) => updateAgent(selectedAgent.id, { name: e.target.value })}
                      className="bg-zinc-950"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Workspace</label>
                    <CustomSelect
                      value={selectedAgent.workspaceId || ''}
                      onValueChange={(val) => assignAgentToWorkspace(selectedAgent.id, val === '__none__' ? undefined : val)}
                      placeholder="No workspace"
                    >
                      <SelectItem value="__none__">No Workspace</SelectItem>
                      {workspaces.map(w => (
                        <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                      ))}
                    </CustomSelect>
                  </div>
                </div>
              </TabPanel>

              <TabPanel id="personality" activeTab={activeAgentTab} className="space-y-3">
                <p className="text-xs text-zinc-500 leading-tight">SOUL, IDENTITY, and ROLE files define how {selectedAgent.name} thinks, communicates, and behaves.</p>
                {(['ROLE.md', 'IDENTITY.md', 'SOUL.md'] as const).map(file => {
                  const label = file.replace('.md', '');
                  const content = personalityFiles?.[file] || '';
                  const isEditing = editingFile === file;
                  return (
                    <div key={file} className="space-y-2 bg-zinc-950 rounded-lg border border-zinc-800 p-3">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{label}</label>
                        {!isEditing ? (
                          <Button variant="ghost" size="sm" onClick={() => startEdit(file)} className="h-6 px-2 text-xs text-zinc-500 hover:text-zinc-300"><Pencil size={12} className="mr-1" /> Edit</Button>
                        ) : (
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => setEditingFile(null)} className="h-6 px-2 text-xs text-zinc-500 hover:text-zinc-300"><X size={12} className="mr-1" /> Cancel</Button>
                            <Button variant="ghost" size="sm" onClick={saveFile} disabled={savingFile} className="h-6 px-2 text-xs text-emerald-400 hover:text-emerald-300"><Check size={12} className="mr-1" /> {savingFile ? 'Saving...' : 'Save'}</Button>
                          </div>
                        )}
                      </div>
                      {isEditing ? (
                        <textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={6} className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 focus-visible:border-indigo-500" />
                      ) : (
                        <p className="text-[11px] text-zinc-500 leading-relaxed whitespace-pre-wrap line-clamp-4">{content || '(empty)'}</p>
                      )}
                    </div>
                  );
                })}
              </TabPanel>

              <TabPanel id="relationships" activeTab={activeAgentTab} className="space-y-4">
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Manager (Reports To)</label>
                    <CustomSelect
                      value={selectedAgent.parentId || ''}
                      onValueChange={(val) => updateAgent(selectedAgent.id, { parentId: val === 'root' ? undefined : val })}
                      placeholder="Select a manager"
                    >
                      <SelectItem value="root">No Parent (Root Hub)</SelectItem>
                      {agents.filter(a => a.id !== selectedAgent.id).map(a => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </CustomSelect>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Collaborators</label>
                    <MultiSelect
                      options={agents.filter(a => a.id !== selectedAgent.id).map(a => ({ value: a.id, label: `${a.name}${a.role ? ` (${a.role})` : ''}` }))}
                      value={selectedAgent.collaborators || []}
                      onChange={(values) => updateAgent(selectedAgent.id, { collaborators: values })}
                      placeholder="Select collaborators"
                    />
                    <p className="text-xs text-zinc-500 mt-1">These agents exchange context horizontally.</p>
                  </div>
                </div>
              </TabPanel>

              <TabPanel id="telegram" activeTab={activeAgentTab} className="space-y-4">
                <div className="space-y-3">
                  <div className="space-y-1.5">
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
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Allowed Telegram IDs</label>
                    <Input
                      placeholder="123456789, 987654321"
                      value={selectedAgent.telegramConfig?.allowedChatIds?.join(', ') || ''}
                      onChange={(e) => {
                        const ids = e.target.value
                          .split(',')
                          .map(s => s.trim())
                          .filter(Boolean)
                          .map(Number)
                          .filter(n => !isNaN(n));
                        updateAgent(selectedAgent.id, {
                          telegramConfig: {
                            ...(selectedAgent.telegramConfig || { status: 'disconnected', botToken: '' }),
                            allowedChatIds: ids.length ? ids : undefined
                          }
                        });
                      }}
                      className="bg-zinc-950 font-mono text-xs"
                    />
                  </div>
                  <p className="text-xs text-zinc-500 leading-tight">Create a bot in @BotFather, paste the token here, and you can chat with {selectedAgent.name} directly from Telegram. The bot will only respond to the Telegram IDs listed above. Leave the IDs field empty to block all incoming messages.</p>

                  {selectedAgent.telegramConfig?.botToken && (
                    <div className="flex flex-col gap-2 bg-zinc-950 p-3 rounded-md border border-zinc-800">
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
                          Send Test Message
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </TabPanel>

              <div className="pt-4 border-t border-zinc-800 mt-4">
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

        {showWorkspaceSettings && selectedWorkspace && (
          <div className="w-80 border border-zinc-800 rounded-xl bg-zinc-900 flex flex-col shrink-0 overflow-y-auto animate-in slide-in-from-right-4 duration-300">
            <div className="p-4 border-b border-zinc-800 flex justify-between items-start sticky top-0 bg-zinc-900/90 backdrop-blur-sm z-10">
              <h3 className="font-semibold text-zinc-100 flex items-center">
                <div className="h-6 w-6 rounded-lg mr-2" style={{ backgroundColor: selectedWorkspace.color }} />
                {selectedWorkspace.name}
              </h3>
              <button onClick={() => setShowWorkspaceSettings(null)} className="text-zinc-500 hover:text-white">×</button>
            </div>

            <Tabs
              tabs={[
                { id: 'settings', label: 'Settings', icon: <FolderKanban size={14} /> },
                { id: 'agents', label: 'Agents', icon: <UsersIcon size={14} /> },
              ]}
              activeTab={activeWorkspaceTab}
              onTabChange={setActiveWorkspaceTab}
              className="px-4"
            />

            <div className="p-4 flex-1 overflow-y-auto">
              <TabPanel id="settings" activeTab={activeWorkspaceTab} className="space-y-4">
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  setSavingWorkspace(true);
                  setSaveStatus('idle');
                  const formData = new FormData(e.currentTarget);
                  try {
                    await updateWorkspace(selectedWorkspace.id, {
                      name: formData.get('name') as string,
                      description: formData.get('description') as string,
                      folderPath: settingsFolderPath || undefined
                    });
                    addLog({ agentId: 'system', action: 'Workspace Updated', details: `Updated workspace: ${formData.get('name')}`, type: 'info' });
                    setSaveStatus('success');
                  } catch {
                    setSaveStatus('error');
                  } finally {
                    setSavingWorkspace(false);
                  }
                }} className="space-y-4">
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Name</label>
                      <Input name="name" defaultValue={selectedWorkspace.name} className="bg-zinc-950" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Description</label>
                      <Input name="description" defaultValue={selectedWorkspace.description} className="bg-zinc-950" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Working Folder</label>
                      <FolderPicker
                        value={settingsFolderPath}
                        onChange={setSettingsFolderPath}
                        placeholder="Select a folder..."
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Color</label>
                      <div className="flex gap-2 flex-wrap">
                        {WORKSPACE_COLORS.map(color => (
                          <button
                            key={color}
                            type="button"
                            onClick={() => updateWorkspace(selectedWorkspace.id, { color })}
                            className={cn("w-7 h-7 rounded-md border-2 transition-all", selectedWorkspace.color === color ? "border-white scale-110" : "border-transparent")}
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={savingWorkspace}>
                    {savingWorkspace ? 'Saving...' : 'Save Changes'}
                  </Button>
                  {saveStatus === 'success' && (
                    <p className="text-xs text-emerald-400 text-center">Workspace saved successfully</p>
                  )}
                  {saveStatus === 'error' && (
                    <p className="text-xs text-red-400 text-center">Failed to save workspace</p>
                  )}
                </form>
              </TabPanel>

              <TabPanel id="agents" activeTab={activeWorkspaceTab} className="space-y-4">
                <h4 className="font-medium text-zinc-200">Agents in this Workspace</h4>
                {agents.filter(a => a.workspaceId === selectedWorkspace.id).length === 0 ? (
                  <p className="text-xs text-zinc-500">No agents assigned yet.</p>
                ) : (
                  <div className="space-y-2">
                    {agents.filter(a => a.workspaceId === selectedWorkspace.id).map(a => (
                      <div key={a.id} className="flex items-center justify-between p-2 bg-zinc-950 rounded-md border border-zinc-800">
                        <span className="text-sm text-zinc-300">{a.name}</span>
                        <button
                          onClick={() => assignAgentToWorkspace(a.id, undefined)}
                          className="text-xs text-zinc-500 hover:text-red-400"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </TabPanel>

              <div className="pt-4 border-t border-zinc-800 mt-4">
                <Button
                  variant="destructive"
                  className="w-full flex justify-center items-center gap-2 bg-red-950/50 hover:bg-red-900 border border-red-900/50 text-red-200"
                  onClick={() => {
                    removeWorkspace(selectedWorkspace.id);
                    setShowWorkspaceSettings(null);
                    addLog({ agentId: 'system', action: 'Workspace Deleted', details: `Deleted workspace: ${selectedWorkspace.name}`, type: 'warning' });
                  }}
                >
                  <Trash2 size={16} /> Delete Workspace
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {showAddAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0" onClick={() => { setShowAddAgent(false); setNewAgentSoul(''); setNewAgentIdentity(''); setNewAgentRoleDoc(''); setNewAgentSlug(''); }} />
          <div className="relative w-full max-w-2xl bg-zinc-950 border border-zinc-800 xl:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-zinc-800 flex justify-between items-start bg-zinc-900/40 shrink-0">
              <div>
                <h3 className="text-xl font-semibold text-zinc-100">Onboard New Agent</h3>
                <p className="text-sm text-zinc-500 mt-1 mb-0">Define basic info and customize personality via SOUL / IDENTITY / ROLE.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowAddAgent(false)} className="rounded-full w-8 h-8 p-0 flex items-center justify-center -mt-2 -mr-2">×</Button>
            </div>

            <div className="flex border-b border-zinc-800 bg-zinc-950/50 shrink-0">
              <button type="button" onClick={() => setFormTab('basic')} className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${formTab === 'basic' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>Basic Info</button>
              <button type="button" onClick={() => setFormTab('personality')} className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${formTab === 'personality' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>Personality</button>
            </div>

            <div className="p-6 overflow-y-auto">
              <form id="add-agent-form" onSubmit={handleAddAgent} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Name</label>
                    <Input name="name" required placeholder="e.g. CodeLlama Assistant" className="bg-zinc-900 shadow-inner border-zinc-800" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Slug</label>
                    <Input name="slug" placeholder="e.g. code-llama (auto-generated from name if empty)" className="bg-zinc-900 shadow-inner border-zinc-800 font-mono text-sm" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Workspace</label>
                    <CustomSelect value={newAgentWorkspace} onValueChange={(v) => setNewAgentWorkspace(v === '__none__' ? '' : v)} placeholder="No workspace">
                      <SelectItem value="__none__">No Workspace</SelectItem>
                      {workspaces.map(w => (
                        <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                      ))}
                    </CustomSelect>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Manager (Reports To)</label>
                    <CustomSelect value={newAgentParent} onValueChange={setNewAgentParent} placeholder="Select a manager">
                      <SelectItem value="">No Parent (Root Hub)</SelectItem>
                      {agents.map(a => (
                        <SelectItem key={a.id} value={a.id}>{a.name}{a.role ? ` (${a.role})` : ''}</SelectItem>
                      ))}
                    </CustomSelect>
                  </div>
                  <div className="space-y-2 sm:col-span-2 text-zinc-300">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Collaborators (Optional)</label>
                    <MultiSelect
                      options={agents.map(a => ({ value: a.id, label: `${a.name}${a.role ? ` (${a.role})` : ''}` }))}
                      value={newAgentCollabs}
                      onChange={setNewAgentCollabs}
                      placeholder="Select collaborators"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Skills (comma separated)</label>
                    <Input name="skills" required placeholder="React, Node.js, Planning" className="bg-zinc-900 shadow-inner border-zinc-800" />
                  </div>
                </div>

                {formTab === 'personality' && (
                  <div className="space-y-4 pt-2">
                    <p className="text-xs text-zinc-500 leading-tight">Define how this agent thinks, communicates, and behaves. Leave empty to auto-generate sensible defaults.</p>
                    <div className="space-y-2 flex flex-col">
                      <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">ROLE — What the agent does</label>
                      <textarea value={newAgentRoleDoc} onChange={e => setNewAgentRoleDoc(e.target.value)} rows={5} className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 font-mono focus-visible:outline-none shadow-inner focus-visible:ring-1 focus-visible:ring-indigo-500 focus-visible:border-indigo-500" placeholder="# Role: AgentName&#10;&#10;## Responsibilities&#10;- ...&#10;&#10;## Expertise & Skills&#10;- ...&#10;&#10;## Authority&#10;- ..." />
                    </div>
                    <div className="space-y-2 flex flex-col">
                      <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">IDENTITY — How the agent communicates</label>
                      <textarea value={newAgentIdentity} onChange={e => setNewAgentIdentity(e.target.value)} rows={5} className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 font-mono focus-visible:outline-none shadow-inner focus-visible:ring-1 focus-visible:ring-indigo-500 focus-visible:border-indigo-500" placeholder="# Identity: AgentName&#10;&#10;## Personality&#10;...&#10;&#10;## Communication Style&#10;- Tone: ...&#10;- Verbosity: ..." />
                    </div>
                    <div className="space-y-2 flex flex-col">
                      <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">SOUL — Core principles and boundaries</label>
                      <textarea value={newAgentSoul} onChange={e => setNewAgentSoul(e.target.value)} rows={5} className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 font-mono focus-visible:outline-none shadow-inner focus-visible:ring-1 focus-visible:ring-indigo-500 focus-visible:border-indigo-500" placeholder="# Core Principles&#10;&#10;## Values&#10;...&#10;&#10;## Boundaries — NEVER&#10;- ...&#10;&#10;## Priority Framework&#10;1. ..." />
                    </div>
                  </div>
                )}
              </form>
            </div>

            <div className="p-6 border-t border-zinc-800 bg-zinc-950 flex justify-end gap-3 shrink-0">
              <Button variant="ghost" type="button" onClick={() => { setShowAddAgent(false); setNewAgentSoul(''); setNewAgentIdentity(''); setNewAgentRoleDoc(''); setNewAgentSlug(''); }}>Cancel</Button>
              <Button type="submit" form="add-agent-form" className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/25">Hire Agent</Button>
            </div>
          </div>
        </div>
      )}

      {showCreateWorkspace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0" onClick={() => { setShowCreateWorkspace(false); setNewWsSlug(''); setNewWsColor(DEFAULT_COLOR); }} />
          <div className="relative w-full max-w-lg bg-zinc-950 border border-zinc-800 xl:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-zinc-800 flex justify-between items-start bg-zinc-900/40 shrink-0">
              <div>
                <h3 className="text-xl font-semibold text-zinc-100">Create Workspace</h3>
                <p className="text-sm text-zinc-500 mt-1 mb-0">A workspace groups agents with shared settings and a working folder.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowCreateWorkspace(false)} className="rounded-full w-8 h-8 p-0 flex items-center justify-center -mt-2 -mr-2">×</Button>
            </div>

            <div className="p-6 overflow-y-auto">
              <form id="create-workspace-form" onSubmit={handleCreateWorkspace} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Name</label>
                  <Input
                    value={newWsName}
                    onChange={e => setNewWsName(e.target.value)}
                    required
                    placeholder="e.g. Frontend Team"
                    className="bg-zinc-900 shadow-inner border-zinc-800"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Slug</label>
                  <Input
                    value={newWsSlug}
                    onChange={e => setNewWsSlug(e.target.value)}
                    placeholder="e.g. frontend-team (auto-generated from name if empty)"
                    className="bg-zinc-900 shadow-inner border-zinc-800 font-mono text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Description</label>
                  <Input
                    value={newWsDescription}
                    onChange={e => setNewWsDescription(e.target.value)}
                    placeholder="What does this workspace focus on?"
                    className="bg-zinc-900 shadow-inner border-zinc-800"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Working Folder</label>
                  <FolderPicker
                    value={newWsFolder}
                    onChange={setNewWsFolder}
                    placeholder="Select a folder..."
                    className="w-full"
                  />
                  <p className="text-xs text-zinc-500 leading-tight">Agents in this workspace will work within this folder path.</p>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Color</label>
                  <div className="flex gap-3">
                    {WORKSPACE_COLORS.map(color => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setNewWsColor(color)}
                        className={cn("w-8 h-8 rounded-lg border-2 transition-all", newWsColor === color ? "border-white scale-110" : "border-transparent hover:scale-105")}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              </form>
            </div>

            <div className="p-6 border-t border-zinc-800 bg-zinc-950 flex justify-end gap-3 shrink-0">
              <Button variant="ghost" type="button" onClick={() => { setShowCreateWorkspace(false); setNewWsSlug(''); }}>Cancel</Button>
              <Button type="submit" form="create-workspace-form" className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/25">Create Workspace</Button>
            </div>
          </div>
        </div>
      )}

      {showInitYml && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0" onClick={() => { setShowInitYml(false); setInitYmlFolder(''); }} />
          <div className="relative w-full max-w-lg bg-zinc-950 border border-zinc-800 xl:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-zinc-800 flex justify-between items-start bg-zinc-900/40 shrink-0">
              <div>
                <h3 className="text-xl font-semibold text-zinc-100">Init from .aicorp.yml</h3>
                <p className="text-sm text-zinc-500 mt-1 mb-0">Select a folder containing an .aicorp.yml file to initialize a workspace with agents, connections, and tasks.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setShowInitYml(false); setInitYmlFolder(''); }} className="rounded-full w-8 h-8 p-0 flex items-center justify-center -mt-2 -mr-2">×</Button>
            </div>

            <div className="p-6 overflow-y-auto">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Project Folder</label>
                  <FolderPicker
                    value={initYmlFolder}
                    onChange={setInitYmlFolder}
                    placeholder="Select folder with .aicorp.yml..."
                    className="w-full"
                  />
                  <p className="text-xs text-zinc-500 leading-tight">The folder must contain a valid .aicorp.yml file. All agents will work within this folder.</p>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-zinc-800 bg-zinc-950 flex justify-end gap-3 shrink-0">
              <Button variant="ghost" type="button" onClick={() => { setShowInitYml(false); setInitYmlFolder(''); }}>Cancel</Button>
              <Button onClick={handleInitYml} disabled={!initYmlFolder} className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/25">Initialize</Button>
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
                <p className="text-sm text-zinc-500 mt-1 mb-0">Instantly deploy a fully configured AI workforce.</p>
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
                        onClick={() => handleApplyTemplate(template)}
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
