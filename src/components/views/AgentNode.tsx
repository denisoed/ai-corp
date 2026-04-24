import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Card, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Network, Users as UsersIcon } from 'lucide-react';

export function AgentNode({ data, selected }: any) {
  const isRoot = data.isRoot;

  return (
    <div className={`transition-all duration-300 w-56 cursor-pointer rounded-xl`}>
      {/* Subordination Handles: Bottom = Source, Top = Target */}
      <Handle type="target" position={Position.Top} id="top" className={`w-3 h-3 bg-zinc-700 border-2 border-zinc-900 ${isRoot ? 'hidden' : ''}`} />
      <Handle type="source" position={Position.Bottom} id="bottom" className="w-3 h-3 bg-zinc-400 border-2 border-zinc-900" />
      
      {/* Collaboration Handles: Right = Source, Left = Target */}
      {!isRoot && <Handle type="source" position={Position.Right} id="right" className="w-3 h-4 rounded-[2px] bg-indigo-500 border-2 border-zinc-900" />}
      {!isRoot && <Handle type="target" position={Position.Left} id="left" className="w-3 h-4 rounded-[2px] bg-indigo-500 border-2 border-zinc-900" />}

      <Card className={`bg-zinc-900 shadow-2xl transition-all duration-300 ${selected ? 'border-indigo-500 shadow-indigo-500/20 scale-[1.02] z-10' : 'border-zinc-800 hover:border-zinc-600'}`}>
        <CardContent className="p-4 flex flex-col items-center text-center gap-1">
          {isRoot ? (
              <div className="h-10 w-10 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-xl flex items-center justify-center mb-2">
                  <Network size={20} />
              </div>
          ) : (
              <div className="h-10 w-10 bg-zinc-800 text-zinc-300 rounded-full flex items-center justify-center font-bold text-sm mb-2 relative shrink-0">
                  {data.name.substring(0,2).toUpperCase()}
                  <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-zinc-900 ${
                    data.status === 'Working' ? 'bg-emerald-500' :
                    data.status === 'Idle' ? 'bg-zinc-500' : 'bg-red-500'
                  }`} />
              </div>
          )}
          
          <div className="space-y-0.5 w-full">
            <h3 className="text-sm font-medium text-zinc-100 line-clamp-1">{data.name}</h3>
            <p className="text-xs text-zinc-500 line-clamp-1">{isRoot ? 'Orchestration Engine' : data.model}</p>
          </div>

          {!isRoot && (
             <div className="mt-3 flex items-center gap-2 flex-wrap justify-center">
                <Badge variant="outline" className="text-[10px] bg-zinc-950/50 py-0.5 font-medium">{data.role}</Badge>
                {data.collaborators?.length > 0 && (
                   <Badge variant="outline" className="text-[10px] bg-indigo-950/30 text-indigo-400 border-indigo-800/50 py-0.5">
                      <UsersIcon size={10} className="mr-1 inline" /> {data.collaborators.length}
                   </Badge>
                )}
             </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
