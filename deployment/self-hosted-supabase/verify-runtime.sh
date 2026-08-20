#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
runtime_root="${FUSTIFY_SUPABASE_ROOT:-${1:-${script_dir}}}"
expected_migration="20260730002339"

[[ -f "${runtime_root}/docker-compose.yml" ]] || { echo "Invalid runtime path." >&2; exit 66; }
cd -- "${runtime_root}"

docker compose ps --status running --services | sort >"${TMPDIR:-/tmp}/fustify-supabase-running.$$"
trap 'rm -f -- "${TMPDIR:-/tmp}/fustify-supabase-running.$$"' EXIT
for service in api-gw auth caddy db functions realtime rest storage supavisor; do
  grep -Fxq "${service}" "${TMPDIR:-/tmp}/fustify-supabase-running.$$" || {
    echo "Required service is not running: ${service}" >&2
    exit 69
  }
done

extensions="$(docker compose exec -T db psql -U postgres -d postgres -Atc \
  "select extname from pg_extension where extname in ('pg_cron','pg_net','supabase_vault') order by extname")"
for extension in pg_cron pg_net supabase_vault; do
  grep -Fxq "${extension}" <<<"${extensions}" || {
    echo "Required extension is unavailable: ${extension}" >&2
    exit 65
  }
done

latest="$(docker compose exec -T db psql -U postgres -d postgres -Atc \
  'select version from supabase_migrations.schema_migrations order by version desc limit 1')"
if [[ "${latest}" != "${expected_migration}" ]]; then
  echo "Migration drift: expected ${expected_migration}, found ${latest:-none}." >&2
  exit 65
fi

bucket_count="$(docker compose exec -T db psql -U postgres -d postgres -Atc \
  "select count(*) from storage.buckets where id in ('profile-avatars','room-thumbnails')")"
if [[ "${bucket_count}" != 2 ]]; then
  echo "Required Storage buckets are missing." >&2
  exit 65
fi

echo "Self-hosted Supabase runtime, extensions, migrations, and buckets are verified."
