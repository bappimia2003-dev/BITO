import {
  BitoError,
  type ExecutionMode,
  type ExecutionStatus,
  type Item,
  type Json,
  type NodeRunStatus,
} from '@bito/shared';
import type {
  Execution,
  ExecutionStore,
  Job,
  NodeRun,
  ScratchHandle,
  WorkflowSnapshot,
} from '../index.js';

export class InMemoryExecutionStore implements ExecutionStore {
  public executions = new Map<string, Execution>();
  public snapshots = new Map<string, WorkflowSnapshot>();
  public jobs = new Map<string, Job>();
  public nodeRuns = new Map<string, NodeRun>();
  public scratch = new Map<string, Json>();
  public logs: unknown[] = [];
  public clock?: { now(): Date };

  private scratchLocks = new Map<string, Promise<void>>();

  public setSnapshot(versionId: string, snapshot: WorkflowSnapshot): void {
    this.snapshots.set(versionId, snapshot);
  }

  public async createExecution(params: {
    workflowId: string;
    versionId: string;
    projectId: string;
    mode: ExecutionMode;
    triggerNodeId?: string;
    triggerPayload?: Item[];
  }): Promise<Execution> {
    const id = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const exec: Execution = {
      id,
      workflowId: params.workflowId,
      versionId: params.versionId,
      projectId: params.projectId,
      status: 'QUEUED',
      mode: params.mode,
      triggerNodeId: params.triggerNodeId,
      triggerPayload: params.triggerPayload,
      vars: {},
      nodeRunCount: 0,
      createdAt: new Date().toISOString(),
    };
    this.executions.set(id, exec);
    return exec;
  }

  public async claimJobs(workerId: string, limit: number, leaseMs: number): Promise<Job[]> {
    const now = this.clock ? this.clock.now() : new Date();
    const readyJobs: Job[] = [];

    for (const job of this.jobs.values()) {
      if (job.status === 'ready' && new Date(job.runAt) <= now) {
        readyJobs.push(job);
      }
    }

    readyJobs.sort((a, b) => new Date(a.runAt).getTime() - new Date(b.runAt).getTime());
    const claimed = readyJobs.slice(0, limit);

    const lockedUntil = new Date(now.getTime() + leaseMs).toISOString();
    for (const job of claimed) {
      job.status = 'running';
      job.lockedBy = workerId;
      job.lockedUntil = lockedUntil;
    }

    return claimed;
  }

  public async reclaimStaleJobs(): Promise<number> {
    const now = this.clock ? this.clock.now() : new Date();
    let reclaimed = 0;

    for (const job of this.jobs.values()) {
      if (job.status === 'running' && job.lockedUntil && new Date(job.lockedUntil) < now) {
        if (job.reclaimCount < 5) {
          job.status = 'ready';
          job.lockedBy = undefined;
          job.lockedUntil = undefined;
          job.reclaimCount++;
          reclaimed++;
        } else {
          job.status = 'dead';
        }
      }
    }

    return reclaimed;
  }

  public async loadSnapshot(versionId: string): Promise<WorkflowSnapshot> {
    const snap = this.snapshots.get(versionId);
    if (!snap) {
      throw new BitoError('NOT_FOUND', `Snapshot not found for version ${versionId}`);
    }
    return snap;
  }

  public async loadExecution(id: string): Promise<Execution> {
    const exec = this.executions.get(id);
    if (!exec) {
      throw new BitoError('NOT_FOUND', `Execution not found with id ${id}`);
    }
    return exec;
  }

  public async startNodeRun(job: Job): Promise<NodeRun> {
    if (job.kind === 'resume' && job.nodeRunId) {
      const existing = this.nodeRuns.get(job.nodeRunId);
      if (existing) {
        existing.status = 'RUNNING';
        return existing;
      }
    }

    const id = `nr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const nodeRun: NodeRun = {
      id,
      executionId: job.executionId,
      nodeId: job.nodeId,
      nodeKey: job.nodeId,
      status: 'RUNNING',
      attempt: job.attempt,
      inputPort: job.inputPort,
      input: job.input,
      queuedAt: job.createdAt,
      startedAt: new Date().toISOString(),
    };
    this.nodeRuns.set(id, nodeRun);
    job.nodeRunId = id;

    const exec = this.executions.get(job.executionId);
    if (exec) {
      exec.nodeRunCount++;
      if (exec.status === 'QUEUED') {
        exec.status = 'RUNNING';
        exec.startedAt = nodeRun.startedAt;
      }
    }

    return nodeRun;
  }

  public async finishNodeRun(id: string, patch: Partial<NodeRun>): Promise<void> {
    const nr = this.nodeRuns.get(id);
    if (!nr) {
      throw new BitoError('NOT_FOUND', `NodeRun not found with id ${id}`);
    }
    Object.assign(nr, patch);
    if (!nr.finishedAt && (patch.status === 'SUCCESS' || patch.status === 'FAILED')) {
      nr.finishedAt = new Date().toISOString();
      if (nr.startedAt) {
        nr.durationMs = new Date(nr.finishedAt).getTime() - new Date(nr.startedAt).getTime();
      }
    }
  }

  public async enqueueJobs(
    jobs: Array<Omit<Job, 'id' | 'createdAt' | 'status' | 'reclaimCount'>>
  ): Promise<void> {
    for (const j of jobs) {
      // Check delivery_key conflict per execution
      const existing = Array.from(this.jobs.values()).find(
        (existingJob) =>
          existingJob.executionId === j.executionId && existingJob.deliveryKey === j.deliveryKey
      );
      if (existing) {
        continue; // Idempotent: ON CONFLICT DO NOTHING
      }

      const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const jobRecord: Job = {
        ...j,
        id,
        status: 'ready',
        reclaimCount: 0,
        createdAt: new Date().toISOString(),
      };
      this.jobs.set(id, jobRecord);
    }
  }

  public async withScratchLock<T>(
    executionId: string,
    nodeId: string,
    fn: (s: ScratchHandle) => Promise<T>
  ): Promise<T> {
    const lockKey = `${executionId}:${nodeId}`;
    const prevLock = this.scratchLocks.get(lockKey) || Promise.resolve();

    let releaseLock: () => void;
    const currentLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    this.scratchLocks.set(lockKey, currentLock);

    await prevLock;
    try {
      const handle: ScratchHandle = {
        get: async () => this.scratch.get(lockKey) ?? null,
        set: async (val: Json) => {
          this.scratch.set(lockKey, val);
        },
      };
      return await fn(handle);
    } finally {
      releaseLock!();
    }
  }

  public async appendLog(entry: unknown): Promise<void> {
    this.logs.push(entry);
  }

  public async tryFinalizeExecution(executionId: string): Promise<ExecutionStatus | null> {
    const exec = this.executions.get(executionId);
    if (!exec) return null;
    if (['SUCCESS', 'FAILED', 'CANCELLED'].includes(exec.status)) {
      return exec.status;
    }

    let hasActive = false;
    let hasWaiting = false;
    const now = this.clock ? this.clock.now() : new Date();

    for (const j of this.jobs.values()) {
      if (j.executionId === executionId) {
        if (j.status === 'running' || (j.status === 'ready' && new Date(j.runAt) <= now)) {
          hasActive = true;
          break;
        }
      }
    }

    if (hasActive) return exec.status;

    for (const nr of this.nodeRuns.values()) {
      if (nr.executionId === executionId && nr.status === 'WAITING') {
        hasWaiting = true;
        break;
      }
    }

    if (hasWaiting) {
      exec.status = 'WAITING';
      return 'WAITING';
    }

    exec.status = 'SUCCESS';
    exec.finishedAt = new Date().toISOString();
    return 'SUCCESS';
  }

  public async setExecutionStatus(
    id: string,
    status: ExecutionStatus,
    error?: Record<string, unknown>
  ): Promise<void> {
    const exec = this.executions.get(id);
    if (!exec) throw new BitoError('NOT_FOUND', `Execution not found with id ${id}`);
    if (['SUCCESS', 'FAILED', 'CANCELLED'].includes(exec.status)) {
      return; // Terminal state guard
    }
    exec.status = status;
    if (error) exec.error = error;
    if (['SUCCESS', 'FAILED', 'CANCELLED'].includes(status)) {
      exec.finishedAt = new Date().toISOString();
    }
  }

  public async cancelExecution(id: string): Promise<void> {
    const exec = this.executions.get(id);
    if (!exec) throw new BitoError('NOT_FOUND', `Execution not found with id ${id}`);
    if (['SUCCESS', 'FAILED', 'CANCELLED'].includes(exec.status)) {
      return;
    }
    exec.status = 'CANCELLED';
    exec.finishedAt = new Date().toISOString();

    for (const j of this.jobs.values()) {
      if (j.executionId === id && (j.status === 'ready' || j.status === 'running')) {
        j.status = 'dead';
      }
    }
    for (const nr of this.nodeRuns.values()) {
      if (nr.executionId === id && nr.status === 'WAITING') {
        nr.status = 'CANCELLED' as NodeRunStatus;
      }
    }
  }

  public async loadPriorNodeRuns(executionId: string): Promise<NodeRun[]> {
    const runs: NodeRun[] = [];
    for (const nr of this.nodeRuns.values()) {
      if (nr.executionId === executionId) {
        runs.push(nr);
      }
    }
    return runs;
  }

  public async updateExecutionVars(id: string, vars: Record<string, Json>): Promise<void> {
    const exec = this.executions.get(id);
    if (exec) {
      exec.vars = { ...exec.vars, ...vars };
    }
  }

  public async markJobDone(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = 'done';
    }
  }
}
