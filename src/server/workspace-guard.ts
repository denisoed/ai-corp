import path from 'path';
import { getStore } from './store';
import { Agent, Workspace } from '../types';

export class WorkspaceAccessDenied extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceAccessDenied';
  }
}

/**
 * Asserts that an agent exists and is assigned to a workspace with a configured folder path.
 */
export function assertAgentInWorkspace(agentId: string): { agent: Agent; workspace: Workspace } {
  const store = getStore();
  const agent = store.agents.find(a => a.id === agentId);
  if (!agent) {
    throw new WorkspaceAccessDenied(`Agent ${agentId} not found`);
  }
  if (!agent.workspaceId) {
    throw new WorkspaceAccessDenied(
      `Agent "${agent.name}" (${agentId}) is not assigned to any workspace`
    );
  }

  const workspace = store.workspaces.find(w => w.id === agent.workspaceId);
  if (!workspace) {
    throw new WorkspaceAccessDenied(
      `Workspace "${agent.workspaceId}" not found for agent "${agent.name}"`
    );
  }
  if (!workspace.folderPath) {
    throw new WorkspaceAccessDenied(
      `Workspace "${workspace.name}" has no folder path configured`
    );
  }

  return { agent, workspace };
}

/**
 * Resolves a relative path against the agent's workspace folder.
 * Throws if the resulting path escapes the workspace (path traversal).
 */
export function resolveWorkspacePath(agentId: string, relativePath: string): string {
  const { workspace } = assertAgentInWorkspace(agentId);
  const base = path.resolve(workspace.folderPath!);
  const target = path.resolve(base, relativePath);

  // Prevent path traversal: target must be inside base
  if (!target.startsWith(base + path.sep) && target !== base) {
    throw new WorkspaceAccessDenied(
      `Path "${relativePath}" resolves to "${target}" which is outside workspace "${base}"`
    );
  }

  return target;
}

/**
 * Checks whether a target path is inside a given workspace folder.
 */
export function isPathInsideWorkspace(workspaceFolder: string, targetPath: string): boolean {
  const base = path.resolve(workspaceFolder);
  const target = path.resolve(targetPath);
  return target === base || target.startsWith(base + path.sep);
}

/**
 * Helper that throws if the agent has no workspace.
 * Use before any file operation triggered by an agent.
 */
export function requireWorkspace(agentId: string): void {
  assertAgentInWorkspace(agentId);
}
