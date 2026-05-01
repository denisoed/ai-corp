import fs from 'fs';
import path from 'path';
import { hasPermission } from '../store';
import { assertAgentInWorkspace, resolveWorkspacePath, WorkspaceAccessDenied } from '../workspace-guard';
import { logAction } from './agent';

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

    const content = fs.readFileSync(targetPath, 'utf8');
    const lines = (args.lines || 2000) as number;
    const truncated = content.length > lines * 1000
      ? content.slice(0, lines * 1000) + '\n... [truncated]'
      : content;

    logAction('File Read', `Read "${args.path}" (${(content.length / 1024).toFixed(1)} KB).`, 'info', executingAgentId);
    return { success: true, path: args.path, content: truncated, size: content.length };
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

    logAction('File Written', `Wrote "${args.path}" (${args.content.length} chars).`, 'success', executingAgentId);
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

    logAction('File Deleted', `Deleted "${args.path}".`, 'warning', executingAgentId);
    return { success: true, message: `File "${args.path}" deleted.` };
  } catch (e: any) {
    if (e instanceof WorkspaceAccessDenied) return { success: false, error: e.message };
    throw e;
  }
}

export async function handleListFiles(args: any, executingAgentId: string): Promise<any> {
  try {
    if (!hasPermission(executingAgentId, 'file:list')) {
      return { success: false, error: 'You do not have file:list permission.' };
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

    return { success: true, path: dirPath, count: files.length, files };
  } catch (e: any) {
    if (e instanceof WorkspaceAccessDenied) return { success: false, error: e.message };
    throw e;
  }
}
