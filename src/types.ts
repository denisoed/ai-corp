export type AgentRole = 'Manager' | 'Developer' | 'Analyst' | 'Reviewer' | 'Designer' | 'DevOps' | 'Research';

export type AgentStatus = 'Idle' | 'Working' | 'Blocked' | 'Error' | 'Offline';

export type PermissionType =
  | 'file:read'
  | 'file:write'
  | 'file:delete'
  | 'file:list'
  | 'folder:read'
  | 'folder:write'
  | 'folder:delete'
  | 'folder:list'
  | 'system:run_commands'
  | 'system:approve_commands'
  | 'system:approve_work'
  | 'system:manage_agents'
  | 'system:manage_permissions'
  | 'system:manage_roles'
  | 'system:manage_crons'
  | 'system:manage_skills'
  | 'system:broadcast'
  | 'system:web_search'
  | 'system:fetch_url'
  | 'system:http_request';

export interface PermissionEntry {
  type: PermissionType;
  scope: 'all' | string[];
}

export interface SkillDefinition {
  id: string;
  org: string;
  name: string;
  url: string;
  description: string;
  category: string;
  skillMdUrl: string;
}

export interface Role {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  permissions: PermissionEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface HttpDomainConfig {
  domain: string;
  headers?: Record<string, string>;
}

export interface WorkspaceSettings {
  autoApproveCheapTasks?: boolean;
  maxParallelTasks?: number;
  allowedRepos?: string[];
  envVars?: Record<string, string>;
  commandExecution?: WorkspaceCommandExecutionSettings;
  allowedHttpDomains?: HttpDomainConfig[];
}

export interface WorkspaceCommandExecutionSettings {
  enabled?: boolean;
  dockerImage?: string;
  allowNetwork?: boolean;
  allowDestructiveCommands?: boolean;
  allowGitWrite?: boolean;
  timeoutMs?: number;
  cpuLimit?: number;
  memoryLimitMb?: number;
  pidsLimit?: number;
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
  providerId?: string;
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
  activeSessions?: number;
  budgetToday?: number;
  spentToday?: number;
  currentTaskId?: string;
  roleIds?: string[];
  permissions?: PermissionEntry[];
}

export type TaskStatus = 'Backlog' | 'Planned' | 'In Progress' | 'Review' | 'Needs Approval' | 'Done' | 'Failed' | 'Blocked';

export type TaskPriority = 'Low' | 'Medium' | 'High' | 'Urgent';
export type TaskRisk = 'low' | 'medium' | 'high' | 'critical';

export interface ApprovalRequest {
  id: string;
  taskId?: string;
  agentId: string;
  commandRunId?: string;
  action: string;
  risk: TaskRisk;
  estimatedCost: number;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  details?: string;
  approverAgentId?: string;
  approverAgentName?: string;
  requiredPermission?: PermissionType;
  permissionScope?: string[];
}

export interface ApprovalRequestInput {
  taskId?: string;
  agentId: string;
  commandRunId?: string;
  action: string;
  risk: TaskRisk;
  estimatedCost: number;
  details?: string;
  approverAgentId?: string;
  approverAgentName?: string;
  requiredPermission?: PermissionType;
  permissionScope?: string[];
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

export type DomainEventType =
  | 'task.status.changed'
  | 'task.completed'
  | 'task.comment.added'
  | 'task.assignee.changed'
  | 'pipeline.stage.started'
  | 'pipeline.stage.completed'
  | 'pipeline.stage.failed'
  | 'pipeline.completed'
  | 'pipeline.failed'
  | 'approval.requested';

export interface EventDefinition {
  type: DomainEventType;
  label: string;
  description: string;
}

export interface DomainEvent {
  id: string;
  type: DomainEventType;
  workspaceId?: string;
  taskId?: string;
  createdAt: string;
  payload: Record<string, unknown>;
}

export type SubscriptionChannel = 'telegram' | 'in_app' | 'internal';

export interface EventSubscription {
  id: string;
  agentId: string;
  eventType: DomainEventType;
  channel: SubscriptionChannel;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  instructions?: string;
  filters: {
    taskId?: string;
    fromStatus?: TaskStatus;
    toStatus?: TaskStatus;
    assigneeId?: string;
  };
  oneshot?: boolean;
}

export interface EventStateSummary {
  definitions: EventDefinition[];
  subscriptions: EventSubscription[];
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
  workingState?: {
    currentGoal: string;
    openQuestions: string[];
    constraints: string[];
    importantDecisions: string[];
    activeWork: string[];
  };
  keyFacts: string[];
  activeTasks: { title: string; status: string }[];
  recentMessages: MemoryMessage[];
  archivedMessages?: number;
  lastSummarizedAt?: string;
  totalMessages: number;
  totalSessions: number;
  createdAt: string;
  retrievalIndex?: {
    updatedAt: string;
    terms: Record<string, number>;
  };
}

export type LogSource = 'system' | 'agent' | 'cron' | 'telegram' | 'task-autopilot' | 'events' | 'tool' | 'llm' | 'pipeline';

export type LogCategory = 'llm' | 'tool' | 'task' | 'agent' | 'cron' | 'telegram' | 'file' | 'event' | 'approval' | 'message' | 'role' | 'web' | 'connection' | 'system' | 'pipeline';

export interface LogMetadata {
  // LLM
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedTokens?: number;
  reasoningTokens?: number;
  cost?: number;
  promptMessages?: unknown[];
  responseContent?: string;
  functionCalls?: string[];
  durationMs?: number;
  // Tool
  toolName?: string;
  toolArgs?: unknown;
  toolResult?: unknown;
  executingAgentName?: string;
  // Task
  taskId?: string;
  taskTitle?: string;
  fromStatus?: string;
  toStatus?: string;
  assigneeName?: string;
  authorName?: string;
  // Agent
  targetAgentId?: string;
  targetAgentName?: string;
  role?: string;
  agentStatus?: string;
  // Cron
  cronId?: string;
  cronName?: string;
  schedule?: string;
  prompt?: string;
  result?: string;
  // Telegram
  chatId?: string | number;
  messageText?: string;
  agentName?: string;
  botName?: string;
  direction?: 'in' | 'out';
  // File
  filePath?: string;
  fileSize?: number;
  operation?: string;
  workspacePath?: string;
  // Event
  eventType?: string;
  eventLabel?: string;
  subscriberCount?: number;
  deliveryChannel?: string;
  deliveryStatus?: string;
  subscriptionId?: string;
  // Approval
  approvalId?: string;
  action?: string;
  risk?: string;
  estimatedCost?: number;
  resolvedBy?: string;
  // Message
  messageId?: string;
  senderName?: string;
  receiverName?: string;
  channel?: string;
  isBroadcast?: boolean;
  // Role
  roleId?: string;
  roleName?: string;
  permission?: string;
  // Web
  url?: string;
  query?: string;
  resultCount?: number;
  fetchedSize?: number;
  // Connection
  connectionType?: string;
  agentAName?: string;
  agentBName?: string;
  // System
  templateName?: string;
  ymlPath?: string;
  agentCount?: number;
  // Skills
  skillId?: string;
  // Pipeline
  pipelineId?: string;
  instanceId?: string;
  stageName?: string;
  stageIndex?: number;
  stageStatus?: string;
  totalStages?: number;
  // Web / HTTP
  method?: string;
}

export interface Log {
  id: string;
  timestamp: string;
  agentId: string;
  action: string;
  details: string;
  type: 'info' | 'success' | 'warning' | 'error';
  source?: LogSource;
  category?: LogCategory;
  workspaceId?: string;
  metadata?: LogMetadata;
}

export type CommandRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'needs_approval' | 'denied' | 'error';

export interface CommandRun {
  id: string;
  workspaceId: string;
  agentId: string;
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  status: CommandRunStatus;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  reason?: string;
  approvalRequestId?: string;
  containerName?: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
}

export interface CommandRunResult {
  success: boolean;
  status: CommandRunStatus;
  commandRunId?: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  reason?: string;
  approvalRequestId?: string;
  containerName?: string;
  durationMs?: number;
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

export interface PipelineStage {
  id: string;
  name: string;
  order: number;
  assigneeRole: AgentRole;
  instructions: string;
  expectedOutput?: string;
  transition: 'auto' | 'approval_required' | 'manual';
  timeoutMinutes?: number;
}

export interface PipelineStageResult {
  stageId: string;
  agentId?: string;
  agentName?: string;
  status: 'pending' | 'completed' | 'failed' | 'rejected' | 'skipped';
  output?: string;
  startedAt?: string;
  completedAt?: string;
  comments: string[];
  chatMessages?: { role: string; content: string; tool_call_id?: string; tool_calls?: unknown }[];
}

export interface Pipeline {
  id: string;
  name: string;
  description?: string;
  workspaceId: string;
  stages: PipelineStage[];
  createdAt: string;
  updatedAt: string;
}

export interface PipelineInstance {
  id: string;
  pipelineId: string;
  taskId: string;
  currentStageIndex: number;
  status: 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  stageResults: PipelineStageResult[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
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

export interface LLMProvider {
  id: string;
  name: string;
  apiKey: string;
  baseUrl?: string;
  defaultModel: string;
  enabled?: boolean;
}

export type ProviderId = 'openai' | 'deepseek' | 'minimax' | 'kimi' | 'gemini';

export interface AppSettings {
  braveApiKey?: string;
  searchEngines?: string[];
  searxngUrl?: string;
  envVars?: Record<string, string>;
  providers?: Record<string, LLMProvider>;
  defaultProviderId?: string;
}
