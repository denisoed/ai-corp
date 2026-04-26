import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronRight, ChevronDown, Folder, File, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

interface FolderNode {
  name: string;
  path: string;
  type: 'directory' | 'file';
  children?: FolderNode[];
}

interface FolderPickerProps {
  value?: string;
  onChange: (path: string) => void;
  placeholder?: string;
  className?: string;
}

function TreeNode({
  node,
  depth,
  selectedPath,
  onSelect,
  onExpand,
}: {
  node: FolderNode;
  depth: number;
  selectedPath: string | undefined;
  onSelect: (path: string) => void;
  onExpand: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isDir = node.type === 'directory';
  const isSelected = selectedPath === node.path;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDir) {
      if (!expanded) {
        onExpand(node.path);
      }
      setExpanded(prev => !prev);
    }
  };

  const handleSelect = () => {
    onSelect(node.path);
  };

  const handleRadioClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleSelect();
  };

  return (
    <div>
      <div
        className={cn(
          "w-full flex items-center gap-1.5 py-1.5 text-xs rounded-md transition-colors cursor-pointer",
          isSelected ? "bg-indigo-600/20" : "hover:bg-zinc-800/50"
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px`, paddingRight: 8 }}
        onClick={handleSelect}
      >
        <div
          onClick={handleRadioClick}
          className={cn(
            "w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors",
            isSelected ? "border-indigo-500 bg-indigo-500" : "border-zinc-600 hover:border-zinc-400"
          )}
        >
          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
        </div>

        {isDir ? (
          <button
            onClick={handleToggle}
            className="p-0.5 hover:bg-zinc-700 rounded flex items-center justify-center shrink-0"
          >
            {expanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
            )}
          </button>
        ) : (
          <span className="w-3.5" />
        )}

        {isDir ? (
          <Folder className={cn("w-4 h-4 shrink-0", isSelected ? "text-indigo-400" : "text-zinc-500")} />
        ) : (
          <File className={cn("w-4 h-4 shrink-0", isSelected ? "text-indigo-400" : "text-zinc-600")} />
        )}
        <span className={cn("truncate flex-1", isSelected ? "text-indigo-300" : "text-zinc-300")}>
          {node.name}
        </span>
      </div>

      {isDir && expanded && node.children && (
        <div>
          {node.children.map(child => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
              onExpand={onExpand}
            />
          ))}
          {node.children.length === 0 && (
            <div
              className="text-xs text-zinc-600 py-1"
              style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
            >
              Empty
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function FolderPicker({ value, onChange, placeholder = "Select a folder", className }: FolderPickerProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tree, setTree] = useState<FolderNode[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadFolder = useCallback(async (folderPath: string): Promise<FolderNode[]> => {
    try {
      const res = await fetch(`/api/folders?path=${encodeURIComponent(folderPath)}`);
      if (!res.ok) {
        setError(`Server error: ${res.status}`);
        return [];
      }
      const data = await res.json();
      return data;
    } catch (err: any) {
      setError(err.message || 'Failed to load folders');
      return [];
    }
  }, []);

  const handleSelect = useCallback((path: string) => {
    onChange(path);
    setOpen(false);
  }, [onChange]);

  const handleExpand = useCallback(async (path: string) => {
    const items = await loadFolder(path);
    if (items.length === 0) return;

    setTree(prev => {
      const updateNode = (nodes: FolderNode[]): FolderNode[] => {
        return nodes.map(node => {
          if (node.path === path) {
            return { ...node, children: items };
          }
          if (node.children) {
            return { ...node, children: updateNode(node.children) };
          }
          return node;
        });
      };
      return updateNode(prev);
    });
  }, [loadFolder]);

  useEffect(() => {
    if (open && tree.length === 0) {
      setLoading(true);
      setError(null);
      loadFolder('').then(items => {
        if (items.length > 0) {
          setTree(items[0].children || []);
        }
      }).catch(() => {
        setError('Failed to load root folder');
      }).finally(() => setLoading(false));
    }
  }, [open, tree.length, loadFolder]);

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 shadow-inner focus:outline-none focus:ring-1 focus:ring-indigo-500",
          !value && "text-zinc-500"
        )}
      >
        <span className={cn("truncate", value ? "font-mono text-xs" : "")}>
          {value || placeholder}
        </span>
        <ChevronDown className="w-4 h-4 opacity-50 shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[260px] rounded-md border border-zinc-800 bg-zinc-950 shadow-xl">
          <div className="max-h-64 overflow-y-auto p-2">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
              </div>
            ) : error ? (
              <div className="text-xs text-red-400 py-4 text-center">{error}</div>
            ) : (
              <div>
                {value && (
                  <button
                    type="button"
                    onClick={() => { onChange(''); setOpen(false); }}
                    className="w-full flex items-center gap-2 py-1.5 px-2 text-xs rounded-md hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 mb-1 border-b border-zinc-800"
                  >
                    Clear selection
                  </button>
                )}
                {tree.map(node => (
                  <TreeNode
                    key={node.path}
                    node={node}
                    depth={0}
                    selectedPath={value}
                    onSelect={handleSelect}
                    onExpand={handleExpand}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
