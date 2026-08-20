#!/usr/bin/env bash
set -Eeuo pipefail

repository_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
output_root="${1:-}"
: "${SUPABASE_PLATFORM_DB_URL:?Set SUPABASE_PLATFORM_DB_URL to the hosted session-pooler or direct connection URL}"

if [[ -z "${output_root}" || "${output_root}" != /* || "${output_root}" == "/" ]]; then
  echo "Usage: SUPABASE_PLATFORM_DB_URL=... $0 /absolute/new/export-directory" >&2
  exit 64
fi
if [[ -e "${output_root}" ]]; then
  echo "Export directory must not already exist: ${output_root}" >&2
  exit 65
fi

mkdir -m 0700 -- "${output_root}"
cd -- "${repository_root}"
pnpm exec supabase db dump --db-url "${SUPABASE_PLATFORM_DB_URL}" \
  -f "${output_root}/roles.sql" --role-only
pnpm exec supabase db dump --db-url "${SUPABASE_PLATFORM_DB_URL}" \
  -f "${output_root}/schema.sql"
pnpm exec supabase db dump --db-url "${SUPABASE_PLATFORM_DB_URL}" \
  -f "${output_root}/data.sql" --use-copy --data-only
sha256sum "${output_root}"/*.sql >"${output_root}/SHA256SUMS"
echo "Platform database export written to ${output_root}. Storage objects are transferred separately."
