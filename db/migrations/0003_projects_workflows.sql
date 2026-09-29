create table projects (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 owner_id uuid not null references users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table project_members (
 project_id uuid not null references projects(id) on delete cascade,
 user_id uuid not null references users(id) on delete cascade,
 role text not null check (role in ('owner','editor','viewer')),
 primary key (project_id, user_id)
);

create table workflows (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references projects(id) on delete cascade,
 name text not null,
 description text not null default '',
 status text not null default 'draft' check (status in ('draft','active','archived')),
 active_version_id uuid, -- FK added after workflow_versions exists
 revision integer not null default 1, -- optimistic concurrency for editor saves
 settings jsonb not null default '{}'::jsonb, -- { timezone, maxExecutionSeconds, maxNodeRuns, saveSuccessLogs }
 created_by uuid references users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create index on workflows(project_id);

create table nodes (
 id uuid primary key default gen_random_uuid(),
 workflow_id uuid not null references workflows(id) on delete cascade,
 key text not null check (key ~ '^[a-z][a-z0-9_]{0,39}$'), -- stable slug used in expressions: {{nodes.<key>...}}
 type text not null, -- e.g. 'telegram.send'
 type_version integer not null default 1,
 name text not null, -- display name
 position_x double precision not null default 0,
 position_y double precision not null default 0,
 config jsonb not null default '{}'::jsonb, -- validated by the node's zod schema
 credential_id uuid, -- FK added after credentials exists
 settings jsonb not null default '{}'::jsonb, -- { retry: {maxAttempts,backoff,delayMs}, onError, timeoutMs, disabled, notes }
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (workflow_id, key)
);

create table connections (
 id uuid primary key default gen_random_uuid(),
 workflow_id uuid not null references workflows(id) on delete cascade,
 source_node_id uuid not null references nodes(id) on delete cascade,
 source_port text not null default 'main',
 target_node_id uuid not null references nodes(id) on delete cascade,
 target_port text not null default 'main',
 unique (workflow_id, source_node_id, source_port, target_node_id, target_port)
);

create table workflow_versions ( -- immutable snapshots
 id uuid primary key default gen_random_uuid(),
 workflow_id uuid not null references workflows(id) on delete cascade,
 version integer not null,
 snapshot jsonb not null, -- { nodes:[...], connections:[...], settings:{} } (credential ids only, never secrets)
 purpose text not null check (purpose in ('activation','manual_run')),
 created_by uuid references users(id),
 created_at timestamptz not null default now(),
 unique (workflow_id, version)
);

alter table workflows add constraint workflows_active_version_fk
 foreign key (active_version_id) references workflow_versions(id);
