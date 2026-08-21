alter table auth_users
  alter column id set default gen_random_uuid()::text;
alter table auth_sessions
  alter column id set default gen_random_uuid()::text;

alter table auth_accounts
  alter column id set default gen_random_uuid()::text;

alter table auth_verifications
  alter column id set default gen_random_uuid()::text;
