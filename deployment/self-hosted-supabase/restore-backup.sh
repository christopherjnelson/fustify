#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
runtime_root="${FUSTIFY_SUPABASE_ROOT:-${script_dir}}"
backup_environment="${FUSTIFY_BACKUP_ENV:-${runtime_root}/.env.backup}"

if [[ "${FUSTIFY_RESTORE_CONFIRMATION:-}" != "RESTORE FUSTIFY SUPABASE" ]]; then
  echo "Set FUSTIFY_RESTORE_CONFIRMATION='RESTORE FUSTIFY SUPABASE' to continue." >&2
  exit 64
fi
[[ -f "${backup_environment}" ]] || { echo "Missing ${backup_environment}." >&2; exit 78; }
command -v restic >/dev/null || { echo "restic is required." >&2; exit 69; }

set -a
source "${backup_environment}"
set +a
: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY is required}"
: "${RESTIC_PASSWORD_FILE:?RESTIC_PASSWORD_FILE is required}"

temporary_root="$(mktemp -d -t fustify-supabase-restore.XXXXXXXX)"
trap 'rm -rf -- "${temporary_root}"' EXIT
restic restore "${FUSTIFY_RESTIC_SNAPSHOT:-latest}" --target "${temporary_root}"
restored_root="${temporary_root}${runtime_root}"
[[ -d "${restored_root}/volumes/db/custom" && -d "${restored_root}/volumes/db/data" && -d "${restored_root}/volumes/storage" ]] || {
  echo "Snapshot does not contain the expected runtime paths." >&2
  exit 65
}

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
recovery_root="${runtime_root}/pre-restore-${timestamp}"
cd -- "${runtime_root}"
docker compose stop
mkdir -p -- "${recovery_root}/volumes/db"
mv -- volumes/db/custom "${recovery_root}/volumes/db/custom"
mv -- volumes/db/data "${recovery_root}/volumes/db/data"
mv -- volumes/storage "${recovery_root}/volumes/storage"
cp -a -- "${restored_root}/volumes/db/custom" volumes/db/custom
cp -a -- "${restored_root}/volumes/db/data" volumes/db/data
cp -a -- "${restored_root}/volumes/storage" volumes/storage
docker compose up -d --wait
echo "Restore completed. Previous data is recoverable at ${recovery_root}."
