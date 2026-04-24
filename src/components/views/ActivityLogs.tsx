import React from 'react';
import { useStore } from '../../store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';

export function ActivityLogs() {
  const { logs } = useStore();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xs uppercase font-bold tracking-widest text-zinc-500">System Logs</h2>
        <p className="text-sm text-zinc-400 mt-1">Chronological history of agent actions, learning, and system events.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Activity Feed</CardTitle>
          <CardDescription>Continuous stream of agent interactions.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {logs.map((log) => (
              <div key={log.id} className="flex gap-4 p-4 rounded-lg bg-zinc-900 border border-zinc-800">
                <div className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${
                  log.type === 'error' ? 'bg-red-500' :
                  log.type === 'warning' ? 'bg-amber-500' :
                  log.type === 'success' ? 'bg-emerald-500' : 'bg-blue-500'
                }`} />
                <div className="flex-1 space-y-1">
                  <div className="flex justify-between items-start">
                    <p className="text-sm font-medium">{log.action}</p>
                    <span className="text-xs text-zinc-500 font-mono">
                      {new Date(log.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-400">{log.details}</p>
                  <div className="flex items-center gap-2 mt-2">
                     <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
                       Source: {log.agentId}
                     </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
