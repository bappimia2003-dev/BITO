create table users (
 id uuid primary key default gen_random_uuid(),
 email citext not null unique,
 display_name text not null,
 password_hash text, -- null = passkey-only account
 is_disabled boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table webauthn_credentials ( -- a user's passkeys
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references users(id) on delete cascade,
 credential_id text not null unique, -- base64url
 public_key bytea not null,
 counter bigint not null default 0,
 transports text[] not null default '{}',
 device_name text,
 created_at timestamptz not null default now(),
 last_used_at timestamptz
);

create table webauthn_challenges ( -- one-time, 5-minute challenges
 id uuid primary key default gen_random_uuid(),
 user_id uuid references users(id) on delete cascade, -- null while registering a brand-new passkey-only user
 pending_email citext, -- set only for passkey-only sign-up
 pending_display_name text,
 challenge text not null,
 purpose text not null check (purpose in ('register','login','reauth')),
 expires_at timestamptz not null,
 created_at timestamptz not null default now()
);

create table sessions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references users(id) on delete cascade,
 token_hash text not null unique, -- sha256(token); raw token only lives in the cookie
 created_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now(),
 last_auth_at timestamptz not null default now(), -- updated on login and on successful re-auth
 expires_at timestamptz not null,
 revoked_at timestamptz,
 ip inet,
 user_agent text
);

create index on sessions(user_id);
