#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
repository_root="$(cd -- "${script_dir}/../.." && pwd -P)"
if [[ "${1:-}" == "--" ]]; then
  shift
fi
runtime_root="${FUSTIFY_LAN_ROOT:-${1:-}}"

if [[ -z "${runtime_root}" || "${runtime_root}" != /* || ! -f "${runtime_root}/compose.yaml" ]]; then
  echo "Set FUSTIFY_LAN_ROOT or pass the absolute installed LAN project path." >&2
  exit 64
fi

FUSTIFY_REPOSITORY_ROOT="${repository_root}" \
  FUSTIFY_SUPABASE_ROOT="${runtime_root}" \
  bash "${repository_root}/deployment/self-hosted-supabase/sync-functions.sh"
bash "${script_dir}/copy-app-source.sh" "${repository_root}" "${runtime_root}"
install -m 0644 "${script_dir}/compose.yaml" "${runtime_root}/compose.yaml"
install -m 0755 "${script_dir}/verify.sh" "${runtime_root}/verify-lan.sh"

(cd -- "${runtime_root}" && docker compose config --quiet)
echo "Fustify LAN sources are current. Use Arcane Redeploy or run docker compose up -d --build --wait."
