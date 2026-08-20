#!/usr/bin/env bash
set -Eeuo pipefail

export PGHOST="${POSTGRES_HOST:-db}"
export PGPORT="${POSTGRES_PORT:-5432}"
export PGDATABASE="${POSTGRES_DB:-postgres}"
export PGUSER="${POSTGRES_MIGRATION_USER:-supabase_admin}"
export PGPASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"

psql -v ON_ERROR_STOP=1 --no-password --no-psqlrc <<'SQL'
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text
);
SQL

for migration in /fustify-migrations/*.sql; do
  filename="$(basename -- "${migration}")"
  if [[ ! "${filename}" =~ ^([0-9]+)_([a-z0-9_]+)\.sql$ ]]; then
    echo "Unsupported migration filename: ${filename}" >&2
    exit 65
  fi
  version="${BASH_REMATCH[1]}"
  name="${BASH_REMATCH[2]}"
  applied="$(psql -Atc "select 1 from supabase_migrations.schema_migrations where version = '${version}'")"
  [[ "${applied}" == 1 ]] && continue

  echo "Applying Fustify migration ${filename}"
  psql -v ON_ERROR_STOP=1 --no-password --no-psqlrc <<SQL
begin;
\ir ${migration}
insert into supabase_migrations.schema_migrations (version, statements, name)
values ('${version}', array[]::text[], '${name}');
commit;
SQL
done

echo "Fustify database migrations are current."
