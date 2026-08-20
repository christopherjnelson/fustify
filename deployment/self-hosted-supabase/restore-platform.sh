#!/usr/bin/env bash
set -Eeuo pipefail

export_root="${1:-}"
runtime_root="${2:-}"
if [[ "${FUSTIFY_PLATFORM_RESTORE_CONFIRMATION:-}" != "RESTORE PLATFORM DATABASE" ]]; then
  echo "Set FUSTIFY_PLATFORM_RESTORE_CONFIRMATION='RESTORE PLATFORM DATABASE' to continue." >&2
  exit 64
fi
if [[ -z "${export_root}" || "${export_root}" != /* || -z "${runtime_root}" || "${runtime_root}" != /* ]]; then
  echo "Usage: $0 /absolute/export-directory /absolute/self-hosted-runtime" >&2
  exit 64
fi
for file in roles.sql schema.sql data.sql SHA256SUMS; do
  [[ -f "${export_root}/${file}" ]] || { echo "Missing ${export_root}/${file}." >&2; exit 66; }
done
[[ -f "${runtime_root}/docker-compose.yml" ]] || { echo "Invalid runtime path." >&2; exit 66; }
(cd -- "${export_root}" && sha256sum --check SHA256SUMS)

cd -- "${runtime_root}"
restart_services=0
restart() {
  if [[ "${restart_services}" == 1 ]]; then
    docker compose up -d --wait
  fi
}
trap restart EXIT
docker compose stop auth rest realtime storage functions
restart_services=1

{
  printf '\\set ON_ERROR_STOP on\n'
  printf 'BEGIN;\n'
  sed '/^\\restrict /d; /^\\unrestrict /d' "${export_root}/roles.sql"
  printf 'SET session_replication_role = replica;\n'
  sed '/^\\restrict /d; /^\\unrestrict /d' "${export_root}/data.sql"
  printf 'COMMIT;\n'
} | docker compose exec -T db psql -U postgres -d postgres

restart
restart_services=0
echo "Platform database restored. All existing user sessions must reauthenticate with the new signing keys."
