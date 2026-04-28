export type AgentRole = 'Manager' | 'Developer' | 'Analyst' | 'Reviewer' | 'Designer' | 'DevOps' | 'Research';

export type AgentStatus = 'Idle' | 'Working' | 'Blocked' | 'Error' | 'Offline';

export interface WorkspaceSettings {
  autoApproveCheapTasks?: boolean;
  maxParallelTasks?: number;
  allowedRepos?: string[];
  envVars?: Record<string, string>;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string;
  folderPath?: string;
  settings?: WorkspaceSettings;
  agentIds: string[];
  color?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Agent {
  id: string;
  name: string;
  slug: string;
  model?: string; 
  role?: AgentRole;
  status: AgentStatus;
  avatarUrl?: string;
  description?: string;
  skills: string[];
  parentId?: string;
  collaborators?: string[];
  workspaceId: string;
  telegramConfig?: {
    botToken: string;
    status: 'disconnected' | 'running' | 'error';
    lastError?: string;
    lastChatId?: number | string;
    allowedChatIds?: (number | string)[];
  };
  busySince?: string;
  budgetToday?: number;
  spentToday?: number;
  currentTaskId?: string;
}

export type TaskStatus = 'Backlog' | 'Planned' | 'In Progress' | 'Review' | 'Needs Approval' | 'Done' | 'Failed' | 'Blocked';

export type TaskPriority = 'Low' | 'Medium' | 'High' | 'Urgent';
export type TaskRisk = 'low' | 'medium' | 'high' | 'critical';

export interface ApprovalRequest {
  id: string;
  taskId?: string;
  agentId: string;
  action: string;
  risk: TaskRisk;
  estimatedCost: number;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  details?: string;
}

export interface Comment {
  id: string;
  authorId: string; 
  authorName: string;
  content: string;
  createdAt: string;
  isQuestion?: boolean;
  type?: 'system' | 'message' | 'action' | 'trace';
  metadata?: any; // For traces: commands, diffs, test outputs
}

export interface SubTask {
  id: string;
  title: string;
  completed: boolean;
  assigneeId?: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  risk: TaskRisk;
  cost: number;
  branch?: string;
  worktree?: string;
  assigneeId?: string; // agent id
  creatorId: string; // agent id or 'user'
  createdAt: string;
  updatedAt: string;
  comments: Comment[];
  tags: string[];
  subtasks: SubTask[];
}

export interface MemoryMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: string;
  source?: 'telegram' | 'api' | 'orchestrator' | 'system';
}

export interface AgentMemory {
  agentId: string;
  agentName: string;
  workspaceId?: string;
  workspaceName?: string;
  workspaceFolder?: string;
  summary: string;
  keyFacts: string[];
  activeTasks: { title: string; status: string }[];
  recentMessages: MemoryMessage[];
  lastSummarizedAt?: string;
  totalMessages: number;
  totalSessions: number;
  createdAt: string;
}

export interface Log {
  id: string;
  timestamp: string;
  agentId: string;
  action: string;
  details: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

export interface AgentTemplate {
  name: string;
  slug?: string;
  model?: string;
  role?: AgentRole;
  description?: string;
  skills: string[];
  parentSlug?: string;
  collaborators?: string[];
  identity?: string;
  soul?: string;
  role_doc?: string;
}

export interface TaskTemplate {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  tags: string[];
  subtasks?: string[];
  assigneeSlug?: string;
}

export interface CompanyTemplate {
  id: string;
  name: string;
  description: string;
  agents: AgentTemplate[];
  tasks: TaskTemplate[];
}

export interface WorkspaceAgentDef {
  name: string;
  slug: string;
  role?: AgentRole;
  skills?: string[];
  description?: string;
  parent?: string;
  collaborators?: string[];
  role_doc?: string;
  identity?: string;
  soul?: string;
}

export interface CronJob {
  id: string;
  name: string;
  description?: string;
  agentId: string;
  workspaceId: string;
  schedule: string;
  prompt: string;
  enabled: boolean;
  lastRunAt?: string;
  lastResult?: string;
  lastStatus?: 'success' | 'error' | 'running';
  createdAt: string;
  updatedAt?: string;
}

export type AgentMessageStatus = 'pending' | 'delivered' | 'replied';

export interface AgentMessage {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  content: string;
  status: AgentMessageStatus;
  reply?: string;
  replyDelivered?: boolean;
  createdAt: string;
  deliveredAt?: string;
  repliedAt?: string;
  chatId?: number | string;
  botToken?: string;
}

export interface WorkspaceTaskDef {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assignee?: string;
  subtasks?: string[];
  tags?: string[];
}

export interface WorkspaceDefinition {
  workspace: {
    slug: string;
    description?: string;
  };
  agents?: WorkspaceAgentDef[];
  tasks?: WorkspaceTaskDef[];
}
