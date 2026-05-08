import fs from 'fs';
import path from 'path';
import { hasPermission } from '../store';
import { assertAgentInWorkspace, resolveWorkspacePath, WorkspaceAccessDenied } from '../workspace-guard';
import { logAction } from './agent';

const readFileCache = new Map<string, { result: any; ts: number }>();
const READ_FILE_CACHE_TTL_MS = 300_000;

export async function handleReadFile(args: any, executingAgentId: string): Promise<any> {
  try {
    assertAgentInWorkspace(executingAgentId);
    if (!hasPermission(executingAgentId, 'file:read', args.path)) {
      return { success: false, error: `You do not have file:read permission for "${args.path}".` };
    }

    const { workspace } = assertAgentInWorkspace(executingAgentId);
    if (!fs.existsSync(workspace.folderPath!)) {
      return { success: false, error: `Workspace folder "${workspace.folderPath}" is not accessible from the server container.` };
    }

    const targetPath = resolveWorkspacePath(executingAgentId, args.path);
    if (!fs.existsSync(targetPath)) {
      return { success: false, error: `Path "${args.path}" not found.` };
    }

    const stat = fs.statSync(targetPath);
    if (stat.isDirectory()) {
      return { success: false, error: `"${args.path}" is a directory. Use list_files to browse.` };
    }

    const cacheKey = `${executingAgentId}:${args.path}`;
    const cached = readFileCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < READ_FILE_CACHE_TTL_MS) {
      return cached.result;
    }

    const content = fs.readFileSync(targetPath, 'utf8');
    const lines = (args.lines || 2000) as number;
    const truncated = content.length > lines * 1000
      ? content.slice(0, lines * 1000) + '\n... [truncated]'
      : content;

    logAction('File Read', `Read "${args.path}" (${(content.length / 1024).toFixed(1)} KB).`, 'info', executingAgentId, 'tool', 'file', undefined, { filePath: args.path, fileSize: content.length, operation: 'read' });
    const result = { success: true, path: args.path, content: truncated, size: content.length };
    readFileCache.set(cacheKey, { result, ts: Date.now() });
    return result;
  } catch (e: any) {
    if (e instanceof WorkspaceAccessDenied) return { success: false, error: e.message };
    throw e;
  }
}

export async function handleWriteFile(args: any, executingAgentId: string): Promise<any> {
  try {
    if (!hasPermission(executingAgentId, 'file:write', args.path)) {
      return { success: false, error: `You do not have file:write permission for "${args.path}".` };
    }

    const targetPath = resolveWorkspacePath(executingAgentId, args.path);
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(targetPath, args.content, 'utf8');

    logAction('File Written', `Wrote "${args.path}" (${args.content.length} chars).`, 'success', executingAgentId, 'tool', 'file', undefined, { filePath: args.path, fileSize: args.content.length, operation: 'write' });
    return { success: true, message: `File "${args.path}" written (${args.content.length} chars).` };
  } catch (e: any) {
    if (e instanceof WorkspaceAccessDenied) return { success: false, error: e.message };
    throw e;
  }
}

export async function handleDeleteFile(args: any, executingAgentId: string): Promise<any> {
  try {
    if (!hasPermission(executingAgentId, 'file:delete', args.path)) {
      return { success: false, error: `You do not have file:delete permission for "${args.path}".` };
    }

    const targetPath = resolveWorkspacePath(executingAgentId, args.path);
    if (!fs.existsSync(targetPath)) {
      return { success: false, error: `File "${args.path}" not found.` };
    }

    const stat = fs.statSync(targetPath);
    if (stat.isDirectory()) {
      return { success: false, error: `"${args.path}" is a directory. Use a shell command to remove directories.` };
    }

    fs.unlinkSync(targetPath);

    logAction('File Deleted', `Deleted "${args.path}".`, 'warning', executingAgentId, 'tool', 'file', undefined, { filePath: args.path, operation: 'delete' });
    return { success: true, message: `File "${args.path}" deleted.` };
  } catch (e: any) {
    if (e instanceof WorkspaceAccessDenied) return { success: false, error: e.message };
    throw e;
  }
}

export async function handleCreateFolder(args: any, executingAgentId: string): Promise<any> {
  try {
    if (!hasPermission(executingAgentId, 'folder:write', args.path)) {
      return { success: false, error: `You do not have folder:write permission for "${args.path}".` };
    }

    const targetPath = resolveWorkspacePath(executingAgentId, args.path);
    if (fs.existsSync(targetPath)) {
      return { success: true, message: `Folder "${args.path}" already exists.`, path: args.path };
    }

    fs.mkdirSync(targetPath, { recursive: true });

    logAction('Folder Created', `Created folder "${args.path}".`, 'success', executingAgentId, 'tool', 'file', undefined, { filePath: args.path, operation: 'create_folder' });
    return { success: true, message: `Folder "${args.path}" created.` };
  } catch (e: any) {
    if (e instanceof WorkspaceAccessDenied) return { success: false, error: e.message };
    throw e;
  }
}

export async function handleDeleteFolder(args: any, executingAgentId: string): Promise<any> {
  try {
    if (!hasPermission(executingAgentId, 'folder:delete', args.path)) {
      return { success: false, error: `You do not have folder:delete permission for "${args.path}".` };
    }

    const targetPath = resolveWorkspacePath(executingAgentId, args.path);
    if (!fs.existsSync(targetPath)) {
      return { success: false, error: `Folder "${args.path}" not found.` };
    }

    const stat = fs.statSync(targetPath);
    if (!stat.isDirectory()) {
      return { success: false, error: `"${args.path}" is not a directory.` };
    }

    fs.rmSync(targetPath, { recursive: true, force: true });

    logAction('Folder Deleted', `Deleted folder "${args.path}".`, 'warning', executingAgentId, 'tool', 'file', undefined, { filePath: args.path, operation: 'delete_folder' });
    return { success: true, message: `Folder "${args.path}" deleted.` };
  } catch (e: any) {
    if (e instanceof WorkspaceAccessDenied) return { success: false, error: e.message };
    throw e;
  }
}

const listFilesCache = new Map<string, { result: any; ts: number }>();
const LIST_FILES_CACHE_TTL_MS = 300_000;

export async function handleListFiles(args: any, executingAgentId: string): Promise<any> {
  try {
    const cacheKey = `${executingAgentId}:${args.path || '.'}`;
    const cached = listFilesCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < LIST_FILES_CACHE_TTL_MS) {
      return cached.result;
    }
    if (!hasPermission(executingAgentId, 'file:list') && !hasPermission(executingAgentId, 'folder:read')) {
      return { success: false, error: 'You do not have file:list or folder:read permission.' };
    }

    const { workspace } = assertAgentInWorkspace(executingAgentId);
    if (!fs.existsSync(workspace.folderPath!)) {
      return { success: false, error: `Workspace folder "${workspace.folderPath}" is not accessible from the server container.` };
    }

    const dirPath = args.path || '.';
    const targetPath = resolveWorkspacePath(executingAgentId, dirPath);

    if (!fs.existsSync(targetPath)) {
      return { success: false, error: `Path "${dirPath}" not found.` };
    }

    const stat = fs.statSync(targetPath);
    if (!stat.isDirectory()) {
      return { success: false, error: `"${dirPath}" is not a directory.` };
    }

    const entries = fs.readdirSync(targetPath, { withFileTypes: true });
    const files = entries
      .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules')
      .map(e => ({
        name: e.name,
        type: e.isDirectory() ? 'directory' as const : 'file' as const,
        size: e.isFile() ? fs.statSync(path.join(targetPath, e.name)).size : undefined,
      }))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    const result = { success: true, path: dirPath, count: files.length, files };
    listFilesCache.set(cacheKey, { result, ts: Date.now() });
    return result;
  } catch (e: any) {
    if (e instanceof WorkspaceAccessDenied) return { success: false, error: e.message };
    throw e;
  }
}
