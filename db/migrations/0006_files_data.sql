create table files (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references projects(id) on delete cascade,
 name text not null,
 kind text not null check (kind in ('csv','xlsx','json')),
 mime text not null,
 size_bytes bigint not null,
 sha256 text not null,
 storage_path text not null, -- path in private bucket
 meta jsonb not null default '{}'::jsonb, -- { sheets:[{name, columns:[...], rowCount}] }
 mappings jsonb not null default '[]'::jsonb, -- saved column mappings
 version integer not null default 1, -- bumped when a node writes rows back
 created_by uuid references users(id),
 created_at timestamptz not null default now(),
 deleted_at timestamptz
);

create index on files(project_id) where deleted_at is null;

create table data_tables ( -- built-in "database" for the DATABASE node category
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references projects(id) on delete cascade,
 name text not null check (name ~ '^[a-z][a-z0-9_]{0,39}$'),
 columns jsonb not null default '[]'::jsonb, -- [{name,type:'string'|'number'|'boolean'|'json'}]
 created_at timestamptz not null default now(),
 unique (project_id, name)
);

create table data_rows (
 id bigserial primary key,
 table_id uuid not null references data_tables(id) on delete cascade,
 data jsonb not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create index on data_rows(table_id);
create index data_rows_gin on data_rows using gin (data jsonb_path_ops);
