create table auth_users (
  id text primary key,
  name text not null,
  email text not null,
  email_verified boolean not null default false,
  image text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint auth_users_email_normalized check (email = lower(btrim(email))),
  constraint auth_users_email_unique unique (email)
);
create table auth_sessions (
  id text primary key,
  expires_at timestamptz not null,
  token text not null unique,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  ip_address text,
  user_agent text,
  user_id text not null references auth_users (id) on delete cascade
);

create index auth_sessions_user_id_idx on auth_sessions (user_id);
create index auth_sessions_expires_at_idx on auth_sessions (expires_at);

create table auth_accounts (
  id text primary key,
  issuer text not null,
  account_id text not null,
  provider_id text not null,
  user_id text not null references auth_users (id) on delete cascade,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint auth_accounts_provider_identity_unique
    unique (issuer, account_id)
);

create index auth_accounts_user_id_idx on auth_accounts (user_id);

create table auth_verifications (
  id text primary key,
  identifier text not null,
  value text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index auth_verifications_identifier_idx
  on auth_verifications (identifier);
create index auth_verifications_expires_at_idx
  on auth_verifications (expires_at);

create table profiles (
  user_id text primary key references auth_users (id) on delete cascade,
  display_name text not null,
  avatar_url text,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint profiles_display_name_valid check (
    display_name = btrim(display_name)
    and char_length(display_name) between 1 and 40
    and display_name !~ '[[:cntrl:]]'
  ),
  constraint profiles_avatar_url_valid check (
    avatar_url is null or avatar_url ~ '^https?://'
  )
);

create unique index profiles_display_name_unique
  on profiles (lower(display_name))
  where onboarding_completed;
