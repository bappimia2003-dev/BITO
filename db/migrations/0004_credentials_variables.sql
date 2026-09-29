create table credentials (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references projects(id) on delete cascade,
 type text not null, -- 'telegramBot','geminiApiKey','whatsappCloud','metaPage','googleOAuth','httpBearer','httpBasic','httpHeader'
 name text not null,
 ciphertext bytea not null, -- AES-256-GCM of JSON secret payload
 iv bytea not null, -- 12 random bytes
 auth_tag bytea not null, -- 16 bytes
 key_version integer not null default 1,
 hint jsonb not null default '{}'::jsonb, -- MASKED display data only, e.g. {"botUsername":"@my_bot","tokenTail":"••••ab12"}
 created_by uuid references users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (project_id, name)
);

alter table nodes add constraint nodes_credential_fk
 foreign key (credential_id) references credentials(id) on delete restrict; -- deletion blocked while used

create table variables ( -- NON-secret values only. Secrets = credentials.
 id uuid primary key default gen_random_uuid(),
 scope text not null check (scope in ('global','project','workflow')),
 owner_id uuid references users(id) on delete cascade, -- scope=global (global = per user account)
 project_id uuid references projects(id) on delete cascade, -- scope=project
 workflow_id uuid references workflows(id) on delete cascade, -- scope=workflow
 key text not null check (key ~ '^[A-Za-z_][A-Za-z0-9_]*$'),
 value jsonb not null,
 updated_at timestamptz not null default now(),
 check (
 (scope='global' and owner_id is not null and project_id is null and workflow_id is null) or
 (scope='project' and project_id is not null and owner_id is null and workflow_id is null) or
 (scope='workflow' and workflow_id is not null and owner_id is null and project_id is null)
 )
);

create unique index variables_global_uq on variables(owner_id, key) where scope='global';
create unique index variables_project_uq on variables(project_id, key) where scope='project';
create unique index variables_workflow_uq on variables(workflow_id, key) where scope='workflow';
