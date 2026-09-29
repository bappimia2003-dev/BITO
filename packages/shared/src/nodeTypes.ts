import type { Item, Json } from './types.js';
import type { BitoError } from './errors.js';

export type NodeCategory =
  'TRIGGERS' | 'LOGIC' | 'AI' | 'DATA' | 'API' | 'DATABASE' | 'FILES' | 'NOTIFICATION' | 'UTILITY';

export interface PortDef {
  id: string;
  label: string;
  kind?: 'main' | 'error' | 'tools';
}

export interface NodeSettings {
  disabled?: boolean;
  timeoutMs?: number;
  retry?: {
    maxAttempts: number;
    backoff: 'fixed' | 'exponential';
    delayMs: number;
  };
  onError?: 'stop' | 'continue' | 'errorPort';
  notes?: string;
}

export interface NodeResult {
  outputs: Record<string, Item[]>;
  wait?: { until: string } | { forResume: true; timeoutAt?: string };
}

export interface FieldDef {
  name: string;
  label: string;
  help?: string;
  type:
    | 'string'
    | 'text'
    | 'number'
    | 'boolean'
    | 'select'
    | 'json'
    | 'keyValue'
    | 'conditions'
    | 'credential'
    | 'file'
    | 'sheet'
    | 'cron'
    | 'timezone'
    | 'schemaBuilder'
    | 'toolList';
  options?: { value: string; label: string }[];
  default?: Json;
  required?: boolean;
  expression?: boolean;
  showIf?: { field: string; equals: Json };
  agentFillable?: boolean;
}

export interface JsonSchemaLite {
  type?: string;
  properties?: Record<string, unknown>;
  items?: unknown;
  required?: string[];
  [key: string]: unknown;
}

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  isWrite?: boolean;
}

export interface AiStep {
  stepNumber: number;
  model: string;
  prompt?: string;
  thought?: string;
  toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
  toolResults?: Array<{ name: string; result: unknown }>;
  output?: unknown;
}

export interface Issue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  nodeKey?: string;
  field?: string;
  connectionId?: string;
}

export interface WorkflowSnapshotNode {
  id: string;
  key: string;
  type: string;
  typeVersion?: number;
  name: string;
  config: Record<string, unknown>;
  credentialId?: string;
  settings?: NodeSettings;
}

export interface WorkflowSnapshotConnection {
  id: string;
  sourceNodeId: string;
  sourcePort: string;
  targetNodeId: string;
  targetPort: string;
}

export interface WorkflowSnapshot {
  nodes: WorkflowSnapshotNode[];
  connections: WorkflowSnapshotConnection[];
  settings?: Record<string, unknown>;
}

export interface GraphView {
  nodes: WorkflowSnapshotNode[];
  connections: WorkflowSnapshotConnection[];
}

export interface ActivationContext {
  workflowId: string;
  projectId: string;
  nodeId: string;
  nodeKey: string;
  getCredential<T>(type: string): Promise<T>;
  endpointUrl?: string;
}

export interface VerifiedRequest {
  method: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  rawBody?: string;
}

export interface TriggerHooks {
  activate(ctx: ActivationContext, config: unknown): Promise<void>;
  deactivate(ctx: ActivationContext, config: unknown): Promise<void>;
  parse?(req: VerifiedRequest, config: unknown): Item[];
}

export interface FileAccess {
  getFile(
    fileId: string
  ): Promise<{ id: string; name: string; mime: string; size: number; data: Uint8Array } | null>;
}

export interface DataTableAccess {
  query(tableId: string, options: unknown): Promise<unknown[]>;
  insert(tableId: string, row: unknown): Promise<unknown>;
  update(tableId: string, options: unknown): Promise<unknown>;
  delete(tableId: string, options: unknown): Promise<number>;
}

export interface SafeHttpRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

export interface SafeHttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  json<T = unknown>(): T;
}

export interface SafeHttp {
  fetch(req: SafeHttpRequest): Promise<SafeHttpResponse>;
}

export interface NodeContext {
  executionId: string;
  workflowId: string;
  projectId: string;
  nodeKey: string;
  inputPort: string;
  attempt: number;
  signal: AbortSignal;
  http: SafeHttp;
  getCredential<T>(type: string): Promise<T>;
  scratch: { get(): Promise<Json | null>; set(v: Json): Promise<void> };
  files: FileAccess;
  dataTables: DataTableAccess;
  log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: Json): void;
  emitAiStep(step: AiStep): void;
  now(): Date;
}

export interface ConfigSchema<TConfig> {
  safeParse(data: unknown):
    | { success: true; data: TConfig }
    | {
        success: false;
        error: { issues: Array<{ message: string; path: Array<string | number> }> };
      };
}

export interface NodeDefinition<TConfig = unknown> {
  type: string;
  version: 1;
  name: string;
  description: string;
  category: NodeCategory;
  icon: string;
  inputs: PortDef[];
  outputs: PortDef[];
  mode: 'perItem' | 'batch';
  stateful?: boolean;
  fields: FieldDef[];
  configSchema: ConfigSchema<TConfig>;
  inputSchema?: JsonSchemaLite;
  outputSchema: JsonSchemaLite;
  credentials: { type: string; required: boolean }[];
  validate?: (config: TConfig, graph: GraphView) => Issue[];
  execute: (ctx: NodeContext, items: Item[], config: TConfig) => Promise<NodeResult>;
  onError?: (
    ctx: NodeContext,
    err: BitoError
  ) => { retryable?: boolean; retryAfterMs?: number } | void;
  trigger?: TriggerHooks;
  toolSpec?: ToolSpec;
}

export interface CatalogNode {
  type: string;
  version: number;
  name: string;
  description: string;
  category: NodeCategory;
  icon: string;
  inputs: PortDef[];
  outputs: PortDef[];
  mode: 'perItem' | 'batch';
  stateful?: boolean;
  fields: FieldDef[];
  inputSchema?: JsonSchemaLite;
  outputSchema: JsonSchemaLite;
  credentials: { type: string; required: boolean }[];
  toolSpec?: ToolSpec;
}
