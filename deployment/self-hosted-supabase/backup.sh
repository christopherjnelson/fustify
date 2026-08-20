#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
runtime_root="${FUSTIFY_SUPABASE_ROOT:-${script_dir}}"
backup_environment="${FUSTIFY_BACKUP_ENV:-${runtime_root}/.env.backup}"

[[ -f "${runtime_root}/docker-compose.yml" ]] || {
  echo "Not a self-hosted Supabase runtime: ${runtime_root}" >&2
  exit 66
}
[[ -f "${backup_environment}" ]] || {
  echo "Missing ${backup_environment}; configure RESTIC_REPOSITORY and RESTIC_PASSWORD_FILE." >&2
  exit 78
}
command -v restic >/dev/null || { echo "restic is required." >&2; exit 69; }
command -v flock >/dev/null || { echo "flock is required." >&2; exit 69; }

set -a
source "${backup_environment}"
set +a
: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY is required}"
: "${RESTIC_PASSWORD_FILE:?RESTIC_PASSWORD_FILE is required}"

exec 9>"${runtime_root}/.backup.lock"
flock -n 9 || { echo "A backup is already running." >&2; exit 75; }

cd -- "${runtime_root}"
started=0
restart_stack() {
  if [[ "${started}" == 1 ]]; then
    docker compose up -d --wait
  fi
}
trap restart_stack EXIT

docker compose stop
started=1
restic backup --tag fustify-supabase \
  .env .supabase-version docker-compose.yml docker-compose.fustify.yml \
  Caddyfile.fustify volumes/db/custom volumes/db/fustify-apply-migrations.sh \
  volumes/db/fustify-migrations volumes/db/data volumes/storage volumes/functions \
  volumes/fustify-src
restic forget --tag fustify-supabase --keep-daily 7 --keep-weekly 4 --prune
restart_stack
started=0
echo "Encrypted off-host Supabase backup completed and the stack is healthy."
