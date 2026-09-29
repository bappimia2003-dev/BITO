import type { Sql } from 'postgres';
import { POST as registerHandler } from '../../apps/web/src/app/api/auth/register/route.js';
import { POST as createProjectHandler } from '../../apps/web/src/app/api/projects/route.js';
import { POST as createWorkflowHandler } from '../../apps/web/src/app/api/projects/[id]/workflows/route.js';
import { env } from '../../apps/web/src/server/env.js';
import { expect } from 'vitest';

export interface TestUser {
  email: string;
  displayName: string;
  password: string;
  cookie?: string;
  id?: string;
}

export function makeReq(
  url: string,
  cookie: string,
  method = 'GET',
  body?: Record<string, unknown>
): Request {
  const randomIp = `192.168.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 200) + 1}`;
  const headers: Record<string, string> = {
    Cookie: cookie,
    Origin: env.APP_URL,
    'x-forwarded-for': randomIp,
  };
  if (body) headers['Content-Type'] = 'application/json';
  return new Request(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

export async function checkStatus(promise: Promise<Response>, expected: number | number[]) {
  const res = await promise;
  if (Array.isArray(expected)) {
    expect(expected).toContain(res.status);
  } else {
    expect(res.status).toBe(expected);
  }
  return res;
}

export async function registerTestUser(user: TestUser): Promise<{ cookie: string; id: string }> {
  const req = makeReq('http://localhost:3000/api/auth/register', '', 'POST', {
    email: user.email,
    displayName: user.displayName,
    password: user.password,
  });
  const res = await registerHandler(req);
  expect(res.status).toBe(200);
  const cookie = res.headers.get('set-cookie')!.split(';')[0]!;
  const data = await res.json();
  return { cookie, id: data.user.id };
}

export async function setupProjectAndWorkflow(
  cookie: string,
  sql: Sql
): Promise<{ projectId: string; workflowId: string }> {
  const projRes = await checkStatus(
    createProjectHandler(
      makeReq('http://localhost:3000/api/projects', cookie, 'POST', { name: 'Alpha Project' })
    ),
    200
  );
  const projData = await projRes.json();
  const projectId = projData.project.id as string;

  const wfRes = await checkStatus(
    createWorkflowHandler(
      makeReq(`http://localhost:3000/api/projects/${projectId}/workflows`, cookie, 'POST', {
        name: 'Data Pipeline',
        description: 'Main processing pipeline',
      }),
      { params: Promise.resolve({ id: projectId }) }
    ),
    200
  );
  const wfData = await wfRes.json();
  const workflowId = wfData.workflow.id as string;

  // Add sample nodes and connections
  const [n1] = await sql`
    INSERT INTO nodes (workflow_id, key, type, name, position_x, position_y)
    VALUES (${workflowId}, 'trigger', 'telegram.trigger', 'Telegram In', 100, 100) RETURNING id
  `;
  const [n2] = await sql`
    INSERT INTO nodes (workflow_id, key, type, name, position_x, position_y)
    VALUES (${workflowId}, 'send', 'telegram.send', 'Telegram Out', 300, 100) RETURNING id
  `;
  await sql`
    INSERT INTO connections (workflow_id, source_node_id, target_node_id)
    VALUES (${workflowId}, ${n1!.id}, ${n2!.id})
  `;

  return { projectId, workflowId };
}
