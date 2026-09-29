export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export interface ItemFileReference {
  fileId: string;
  name: string;
  mime: string;
}

export interface Item {
  json: Record<string, Json>;
  file?: ItemFileReference;
}

export type ExecutionStatus = 'QUEUED' | 'RUNNING' | 'WAITING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';

export type NodeRunStatus =
  'QUEUED' | 'RUNNING' | 'WAITING' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'SKIPPED';

export type ExecutionMode = 'trigger' | 'manual' | 'schedule' | 'retry';

export type ProjectRole = 'owner' | 'editor' | 'viewer';

export type WorkflowStatus = 'draft' | 'active' | 'archived';

export interface ErrorInfo {
  code: string;
  message: string;
  nodeKey?: string;
  details?: Record<string, unknown>;
}

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface HealthResponse {
  ok: boolean;
  db: boolean;
  version: string;
}
