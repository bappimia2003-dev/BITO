create table executions (
 id uuid primary key default gen_random_uuid(),
 workflow_id uuid not null references workflows(id) on delete cascade,
 version_id uuid not null references workflow_versions(id),
 project_id uuid not null references projects(id) on delete cascade,
 status text not null default 'QUEUED'
 check (status in ('QUEUED','RUNNING','WAITING','SUCCESS','FAILED','CANCELLED')),
 mode text not null check (mode in ('trigger','manual','schedule','retry')),
 trigger_node_id uuid,
 trigger_payload jsonb, -- items that started it (redacted of secrets)
 vars jsonb not null default '{}'::jsonb, -- execution-scope variables
 error jsonb, -- { code, message, nodeKey }
 retry_of_execution_id uuid references executions(id),
 node_run_count integer not null default 0, -- guards infinite loops
 created_at timestamptz not null default now(),
 started_at timestamptz,
 finished_at timestamptz
);

create index on executions(workflow_id, created_at desc);
create index on executions(project_id, created_at desc);
create index on executions(status) where status in ('QUEUED','RUNNING','WAITING');

create table node_runs ( -- one row per run of a node ("node_states")
 id uuid primary key default gen_random_uuid(),
 execution_id uuid not null references executions(id) on delete cascade,
 node_id uuid not null,
 node_key text not null,
 status text not null check (status in ('QUEUED','RUNNING','WAITING','SUCCESS','FAILED','CANCELLED','SKIPPED')),
 attempt integer not null default 1,
 input_port text not null default 'main',
 input jsonb, -- items in
 output jsonb, -- { portId: items[] }
 progress jsonb, -- perItem nodes: { done:n, outputs:{port:items[]} } to avoid duplicate side effects on retry
 error jsonb, -- { code, message, retryable }
 queued_at timestamptz not null default now(),
 started_at timestamptz,
 finished_at timestamptz,
 duration_ms integer
);

create index on node_runs(execution_id, queued_at);

create table jobs ( -- the durable queue
 id bigserial primary key,
 execution_id uuid not null references executions(id) on delete cascade,
 node_id uuid not null,
 node_run_id uuid references node_runs(id) on delete cascade,
 kind text not null default 'run' check (kind in ('run','resume')),
 input_port text not null default 'main',
 input jsonb not null default '[]'::jsonb, -- items
 delivery_key text not null, -- idempotency: "<fromNodeRunId>:<connectionId>" or "trigger:0"
 attempt integer not null default 1,
 reclaim_count integer not null default 0,
 status text not null default 'ready' check (status in ('ready','running','done','dead')),
 run_at timestamptz not null default now(),
 locked_by text,
 locked_until timestamptz,
 created_at timestamptz not null default now(),
 unique (execution_id, delivery_key, kind)
);

create index jobs_ready_idx on jobs (run_at, id) where status = 'ready';
create index jobs_running_idx on jobs (locked_until) where status = 'running';
create index jobs_exec_idx on jobs (execution_id);

create table execution_scratch ( -- per-node private state (Merge buffers, ForEach cursor). Accessed under row lock.
 execution_id uuid not null references executions(id) on delete cascade,
 node_id uuid not null,
 state jsonb not null default '{}'::jsonb,
 primary key (execution_id, node_id)
);

create table logs (
 id bigserial primary key,
 execution_id uuid not null references executions(id) on delete cascade,
 node_run_id uuid references node_runs(id) on delete cascade,
 level text not null check (level in ('debug','info','warn','error')),
 kind text not null check (kind in ('system','node','http','ai_step')),
 message text not null,
 data jsonb, -- ALWAYS passed through redact() before insert
 ts timestamptz not null default now()
);

create index on logs(execution_id, id);
