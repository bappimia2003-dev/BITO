import { type SafeHttp, type SafeHttpRequest, type SafeHttpResponse } from '@bito/shared';
import {
  InMemoryExecutionStore,
  NodeRegistry,
  processJob,
  type Clock,
  type CredentialResolver,
} from '../../src/index.js';
import { manualTriggerNode } from '../../../nodes/src/triggers/manual/index.js';
import { setNode } from '../../../nodes/src/data/set/index.js';
import { ifNode } from '../../../nodes/src/logic/if/index.js';
import { noopNode } from '../../../nodes/src/logic/noop/index.js';
import { waitNode } from '../../../nodes/src/logic/wait/index.js';
import { stopNode } from '../../../nodes/src/logic/stop/index.js';

export class MockClock implements Clock {
  constructor(public currentTime = new Date()) {}
  now(): Date {
    return this.currentTime;
  }
  advanceMs(ms: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + ms);
  }
}

export class MockSafeHttp implements SafeHttp {
  public requests: SafeHttpRequest[] = [];
  public mockResponse: SafeHttpResponse = {
    status: 200,
    statusText: 'OK',
    headers: {},
    body: '{"success":true}',
    json<T>() {
      return JSON.parse(this.body) as T;
    },
  };

  async fetch(req: SafeHttpRequest): Promise<SafeHttpResponse> {
    this.requests.push(req);
    return this.mockResponse;
  }
}

export class MockCredentialResolver implements CredentialResolver {
  public credentials = new Map<string, Record<string, unknown>>();
  async resolve(_projectId: string, credentialId: string): Promise<Record<string, unknown>> {
    const cred = this.credentials.get(credentialId);
    if (!cred) return {};
    return cred;
  }
}

export function createTestFixture() {
  const store = new InMemoryExecutionStore();
  const registry = new NodeRegistry();
  const clock = new MockClock();
  store.clock = clock;
  const http = new MockSafeHttp();
  const resolver = new MockCredentialResolver();

  registry.register(manualTriggerNode as never);
  registry.register(setNode as never);
  registry.register(ifNode as never);
  registry.register(noopNode as never);
  registry.register(waitNode as never);
  registry.register(stopNode as never);

  async function drainQueue(executionId: string, maxIterations = 20): Promise<void> {
    for (let iter = 0; iter < maxIterations; iter++) {
      clock.advanceMs(10);
      const jobs = await store.claimJobs('worker-1', 5, 60_000);
      const execJobs = jobs.filter((j) => j.executionId === executionId);
      if (execJobs.length === 0) {
        break;
      }

      for (const job of execJobs) {
        await processJob(job, {
          store,
          registry,
          http,
          credentialResolver: resolver,
          clock,
        });
      }
    }
  }

  return { store, registry, clock, http, resolver, drainQueue };
}
