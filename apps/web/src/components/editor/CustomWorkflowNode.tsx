'use client';

import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  Play,
  Settings,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Code2,
  GitBranch,
  Globe,
  Database,
  Bot,
  Zap,
} from 'lucide-react';
import type { FlowNode } from './types.js';
import { useEditor } from './EditorContext.js';

function getNodeIcon(type: string, category?: string) {
  if (category === 'TRIGGERS' || type.startsWith('trigger_') || type === 'manual') {
    return <Zap className="h-4 w-4 text-amber-500" />;
  }
  if (category === 'AI' || type.startsWith('ai_')) {
    return <Bot className="h-4 w-4 text-purple-500" />;
  }
  if (type === 'http_request') {
    return <Globe className="h-4 w-4 text-blue-500" />;
  }
  if (type === 'if' || type === 'switch') {
    return <GitBranch className="h-4 w-4 text-orange-500" />;
  }
  if (type === 'code') {
    return <Code2 className="h-4 w-4 text-emerald-500" />;
  }
  if (category === 'DATA' || type === 'set' || type === 'filter') {
    return <Database className="h-4 w-4 text-cyan-500" />;
  }
  return <Settings className="h-4 w-4 text-muted-foreground" />;
}

export const CustomWorkflowNode = memo(function CustomWorkflowNode({
  id,
  data,
  selected,
}: NodeProps<FlowNode>) {
  const { catalog, issues, setSelectedNodeId } = useEditor();
  const def = catalog[data.type];

  const nodeIssues = issues.filter((i) => i.nodeKey === data.key);
  const hasErrors = nodeIssues.some((i) => i.severity === 'error');
  const hasWarnings = nodeIssues.some((i) => i.severity === 'warning');

  const status = data.status || 'idle';

  let statusRingClass = 'border-border/80 shadow-sm';
  if (status === 'running') {
    statusRingClass = 'border-blue-500 ring-2 ring-blue-500/40 animate-pulse';
  } else if (status === 'success') {
    statusRingClass = 'border-emerald-500 ring-2 ring-emerald-500/30';
  } else if (status === 'failed') {
    statusRingClass = 'border-destructive ring-2 ring-destructive/40';
  } else if (status === 'waiting') {
    statusRingClass = 'border-amber-500 ring-2 ring-amber-500/30';
  } else if (status === 'skipped') {
    statusRingClass = 'border-muted-foreground/40 opacity-60';
  }

  const inputs =
    def?.inputs && def.inputs.length > 0 ? def.inputs : [{ portId: 'main', label: 'In' }];
  const outputs =
    def?.outputs && def.outputs.length > 0 ? def.outputs : [{ portId: 'main', label: 'Out' }];

  const isTrigger =
    def?.category === 'TRIGGERS' || data.type === 'manual' || data.type.startsWith('trigger_');

  return (
    <div
      onClick={() => setSelectedNodeId(id)}
      className={`relative min-w-[200px] max-w-[240px] rounded-xl border bg-card/95 text-card-foreground backdrop-blur-sm transition-all duration-150 ${statusRingClass} ${
        selected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''
      }`}
    >
      {/* Input handles */}
      {!isTrigger &&
        inputs.map((inp, idx) => (
          <Handle
            key={inp.portId}
            type="target"
            position={Position.Left}
            id={inp.portId}
            style={{
              top: `${((idx + 1) / (inputs.length + 1)) * 100}%`,
              background: '#94a3b8',
              width: 10,
              height: 10,
              border: '2px solid var(--background, #09090b)',
            }}
          />
        ))}

      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 px-3 py-2 text-xs">
        <div className="flex items-center gap-1.5 font-medium truncate">
          {getNodeIcon(data.type, def?.category)}
          <span className="truncate">{def?.name || data.type}</span>
        </div>
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          {data.key}
        </span>
      </div>

      {/* Body */}
      <div className="p-3">
        <div className="text-sm font-semibold truncate text-foreground">{data.name}</div>
        <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="capitalize">{def?.category?.toLowerCase() || 'node'}</span>
          {status !== 'idle' && (
            <div className="flex items-center gap-1 font-mono capitalize">
              {status === 'running' && <Play className="h-3 w-3 animate-spin text-blue-500" />}
              {status === 'success' && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
              {status === 'failed' && <XCircle className="h-3 w-3 text-destructive" />}
              {status === 'waiting' && <Clock className="h-3 w-3 text-amber-500" />}
              <span>{status}</span>
            </div>
          )}
        </div>
      </div>

      {/* Issue Badges */}
      {(hasErrors || hasWarnings) && (
        <div
          className={`absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full text-white shadow-sm ${
            hasErrors ? 'bg-destructive' : 'bg-amber-500'
          }`}
          title={nodeIssues.map((i) => i.message).join('\n')}
        >
          <AlertCircle className="h-3 w-3" />
        </div>
      )}

      {/* Output handles */}
      {outputs.map((out, idx) => (
        <React.Fragment key={out.portId}>
          <Handle
            type="source"
            position={Position.Right}
            id={out.portId}
            style={{
              top: `${((idx + 1) / (outputs.length + 1)) * 100}%`,
              background:
                out.portId === 'true' ? '#10b981' : out.portId === 'false' ? '#ef4444' : '#3b82f6',
              width: 10,
              height: 10,
              border: '2px solid var(--background, #09090b)',
            }}
          />
          {outputs.length > 1 && (
            <span
              className="absolute right-3.5 text-[9px] font-mono text-muted-foreground pointer-events-none"
              style={{
                top: `${((idx + 1) / (outputs.length + 1)) * 100}%`,
                transform: 'translateY(-50%)',
              }}
            >
              {out.label || out.portId}
            </span>
          )}
        </React.Fragment>
      ))}
    </div>
  );
});
