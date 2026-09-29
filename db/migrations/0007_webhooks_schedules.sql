create table webhook_endpoints (
 id uuid primary key default gen_random_uuid(),
 workflow_id uuid not null references workflows(id) on delete cascade,
 node_id uuid not null,
 provider text not null check (provider in ('generic','telegram','whatsapp','meta','resume')),
 token text not null unique, -- 32 random bytes, base64url -> URL path segment
 secret_ciphertext bytea, -- HMAC secret (generic) / verify secrets, AES-GCM
 secret_iv bytea,
 secret_auth_tag bytea,
 secret_hash text, -- sha256 of Telegram secret_token (compare constant-time)
 credential_id uuid references credentials(id) on delete restrict,
 config jsonb not null default '{}'::jsonb, -- { methods: ['POST'], requireSignature:true }
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 unique (workflow_id, node_id, provider)
);

create table webhook_events ( -- replay / duplicate protection
 id bigserial primary key,
 endpoint_id uuid not null references webhook_endpoints(id) on delete cascade,
 event_key text not null, -- telegram update_id / whatsapp message id / sha256(ts+signature)
 received_at timestamptz not null default now(),
 unique (endpoint_id, event_key)
);

create table schedules (
 id uuid primary key default gen_random_uuid(),
 workflow_id uuid not null references workflows(id) on delete cascade,
 node_id uuid not null,
 cron text not null,
 timezone text not null default 'UTC', -- IANA name
 next_run_at timestamptz not null,
 last_run_at timestamptz,
 enabled boolean not null default true,
 unique (workflow_id, node_id)
);

create index on schedules(next_run_at) where enabled;

create table rate_limits (
 key text not null,
 window_start timestamptz not null,
 count integer not null default 0,
 primary key (key, window_start)
);
