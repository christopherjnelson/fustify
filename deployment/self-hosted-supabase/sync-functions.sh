#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
repository_root="${FUSTIFY_REPOSITORY_ROOT:-$(cd -- "${script_dir}/../.." && pwd -P)}"
runtime_root="${FUSTIFY_SUPABASE_ROOT:-${1:-}}"

if [[ -z "${runtime_root}" || "${runtime_root}" != /* || ! -f "${runtime_root}/docker-compose.yml" ]]; then
  echo "Set FUSTIFY_SUPABASE_ROOT or pass the absolute installed stack path." >&2
  exit 64
fi

rm -rf -- "${runtime_root}/volumes/fustify-src"
mkdir -p -- "${runtime_root}/volumes/fustify-src"
cp -a -- "${repository_root}/src/." "${runtime_root}/volumes/fustify-src/"
mkdir -p -- "${runtime_root}/volumes/db/fustify-migrations"

for function_name in announce-public-room complete-discord-profile multiplayer-game; do
  source_path="${repository_root}/supabase/functions/${function_name}"
  [[ -d "${source_path}" ]] || {
    echo "Missing source function: ${source_path}" >&2
    exit 66
  }
  rm -rf -- "${runtime_root}/volumes/functions/${function_name}"
  cp -a -- "${source_path}" "${runtime_root}/volumes/functions/${function_name}"
done

for migration in "${repository_root}"/supabase/migrations/*.sql; do
  install -m 0644 "${migration}" "${runtime_root}/volumes/db/fustify-migrations/$(basename -- "${migration}")"
done
install -m 0755 \
  "${repository_root}/deployment/self-hosted-supabase/apply-migrations.sh" \
  "${runtime_root}/volumes/db/fustify-apply-migrations.sh"

echo "Synchronized Fustify migrations and Edge Functions into ${runtime_root}."
