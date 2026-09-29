import type { Node, Edge } from '@xyflow/react';

export interface WorkflowNodeSettings {
  retries?: number;
  backoff?: 'fixed' | 'exponential';
  onError?: 'stop' | 'continue' | 'route_to_error';
  timeoutMs?: number;
  disabled?: boolean;
  [key: string]: unknown;
}

export interface WorkflowNodeData extends Record<string, unknown> {
  nodeId: string;
  key: string;
  type: string;
  typeVersion: number;
  name: string;
  config: Record<string, unknown>;
  credentialId?: string | null;
  settings: WorkflowNodeSettings;
  status?: 'idle' | 'running' | 'success' | 'failed' | 'waiting' | 'skipped';
  hasIssues?: boolean;
  issueMessages?: string[];
}

export type FlowNode = Node<WorkflowNodeData>;
export type FlowEdge = Edge;

export interface WorkflowMeta {
  id: string;
  projectId: string;
  name: string;
  description: string;
  status: 'draft' | 'active' | 'archived';
  revision: number;
  settings: Record<string, unknown>;
  activeVersionId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface NodeDefinitionMeta {
  type: string;
  version: number;
  name: string;
  description: string;
  category: 'TRIGGERS' | 'DATA' | 'FLOW' | 'INTEGRATIONS' | 'AI' | 'UTILITY';
  inputs: Array<{ portId: string; label: string; mode?: string }>;
  outputs: Array<{ portId: string; label: string; mode?: string }>;
  fields: Array<{
    name: string;
    label: string;
    type: 'string' | 'select' | 'number' | 'boolean' | 'json' | 'textarea' | 'credential';
    description?: string;
    required?: boolean;
    defaultValue?: unknown;
    options?: Array<{ label: string; value: string | number | boolean }>;
    credentialType?: string;
    expression?: boolean;
    displayOptions?: {
      show?: Record<string, unknown[]>;
      hide?: Record<string, unknown[]>;
    };
  }>;
}

export interface EditorExecutionState {
  id: string;
  status: 'QUEUED' | 'RUNNING' | 'WAITING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
  mode: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  error?: Record<string, unknown> | null;
  nodeRuns: Array<{
    id: string;
    nodeId: string;
    nodeKey: string;
    status: 'QUEUED' | 'RUNNING' | 'WAITING' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'SKIPPED';
    attempt: number;
    inputPort: string;
    input?: unknown;
    output?: unknown;
    error?: unknown;
    startedAt?: string | null;
    finishedAt?: string | null;
    durationMs?: number | null;
  }>;
}

export interface GraphSnapshot {
  nodes: FlowNode[];
  edges: FlowEdge[];
}
