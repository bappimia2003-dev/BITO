import type { ExecutionMode, ExecutionStatus, Item, Json, NodeRunStatus } from '@bito/shared';

export interface WorkflowSnapshotNode {
  id: string;
  key: string;
  type: string;
  typeVersion?: number;
  name: string;
  config: Record<string, unknown>;
  credentialId?: string;
  settings?: Record<string, unknown>;
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
  settings: Record<string, unknown>;
}

export interface Execution {
  id: string;
  workflowId: string;
  versionId: string;
  projectId: string;
  status: ExecutionStatus;
  mode: ExecutionMode;
  triggerNodeId?: string;
  triggerPayload?: Item[];
  vars: Record<string, Json>;
  error?: Record<string, unknown>;
  nodeRunCount: number;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface Job {
  id: string;
  executionId: string;
  nodeId: string;
  nodeRunId?: string;
  kind: 'run' | 'resume';
  inputPort: string;
  input: Item[];
  deliveryKey: string;
  attempt: number;
  reclaimCount: number;
  status: 'ready' | 'running' | 'done' | 'dead';
  runAt: string;
  lockedBy?: string;
  lockedUntil?: string;
  createdAt: string;
}

export interface NodeRun {
  id: string;
  executionId: string;
  nodeId: string;
  nodeKey: string;
  status: NodeRunStatus;
  attempt: number;
  inputPort: string;
  input?: Item[];
  output?: Record<string, Item[]>;
  progress?: Record<string, unknown>;
  error?: Record<string, unknown>;
  queuedAt: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
}

export interface Clock {
  now(): Date;
}

export interface CredentialResolver {
  resolve(projectId: string, credentialId: string): Promise<Record<string, unknown>>;
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

export interface ScratchHandle {
  get(): Promise<Json | null>;
  set(val: Json): Promise<void>;
}

export interface ExecutionStore {
  createExecution(params: {
    workflowId: string;
    versionId: string;
    projectId: string;
    mode: ExecutionMode;
    triggerNodeId?: string;
    triggerPayload?: Item[];
  }): Promise<Execution>;
  claimJobs(workerId: string, limit: number, leaseMs: number): Promise<Job[]>;
  reclaimStaleJobs(): Promise<number>;
  loadSnapshot(versionId: string): Promise<WorkflowSnapshot>;
  loadExecution(id: string): Promise<Execution>;
  startNodeRun(job: Job): Promise<NodeRun>;
  finishNodeRun(id: string, patch: Partial<NodeRun>): Promise<void>;
  enqueueJobs(
    jobs: Array<Omit<Job, 'id' | 'createdAt' | 'status' | 'reclaimCount'>>
  ): Promise<void>;
  withScratchLock<T>(
    executionId: string,
    nodeId: string,
    fn: (s: ScratchHandle) => Promise<T>
  ): Promise<T>;
  appendLog(entry: unknown): Promise<void>;
  tryFinalizeExecution(executionId: string): Promise<ExecutionStatus | null>;
  setExecutionStatus(
    id: string,
    status: ExecutionStatus,
    error?: Record<string, unknown>
  ): Promise<void>;
  cancelExecution(id: string): Promise<void>;
}
