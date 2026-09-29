create table audit_logs (
 id bigserial primary key,
 user_id uuid references users(id) on delete set null,
 project_id uuid references projects(id) on delete set null,
 action text not null, -- 'auth.login','auth.login_failed','credential.create',...
 target_type text,
 target_id text,
 ip inet,
 user_agent text,
 meta jsonb not null default '{}'::jsonb, -- NEVER contains secrets
 created_at timestamptz not null default now()
);

create index on audit_logs(project_id, created_at desc);
create index on audit_logs(user_id, created_at desc);

create function audit_logs_immutable() returns trigger language plpgsql
as $$
begin raise exception 'audit_logs is append-only'; end $$;

create trigger audit_logs_no_update before update or delete on audit_logs
 for each row execute function audit_logs_immutable();

-- Defense in depth: our server connects with a privileged role (bypasses RLS).
-- Enabling RLS with NO policies blocks any accidental access through Supabase's public API keys.
do $$ declare t record; begin
 for t in select tablename from pg_tables where schemaname = 'public' loop
 execute format('alter table public.%I enable row level security', t.tablename);
 end loop;
end $$;
