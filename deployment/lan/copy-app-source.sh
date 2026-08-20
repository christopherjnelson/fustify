#!/usr/bin/env bash
set -Eeuo pipefail

repository_root="${1:-}"
runtime_root="${2:-}"

if [[ -z "${repository_root}" || ! -f "${repository_root}/package.json" ]]; then
  echo "Invalid Fustify repository path." >&2
  exit 66
fi
if [[ -z "${runtime_root}" || "${runtime_root}" != /* || ! -f "${runtime_root}/compose.yaml" ]]; then
  echo "Invalid Fustify LAN runtime path." >&2
  exit 66
fi

app_target="${runtime_root}/app"
rm -rf -- "${app_target}"
mkdir -p -- "${app_target}/supabase" "${app_target}/tests"

for directory in api public scripts src; do
  cp -a -- "${repository_root}/${directory}" "${app_target}/${directory}"
done
cp -a -- "${repository_root}/tests/integration" "${app_target}/tests/integration"
cp -a -- "${repository_root}/supabase/functions" "${app_target}/supabase/functions"

for file in \
  index.html package.json pnpm-lock.yaml tsconfig.json tsconfig.api.json \
  tsconfig.app.json tsconfig.node.json vite.api.config.ts vite.config.ts \
  vitest.deployment.config.ts vitest.integration.config.ts; do
  install -m 0644 "${repository_root}/${file}" "${app_target}/${file}"
done

install -m 0644 "${repository_root}/deployment/lan/Dockerfile" "${app_target}/Dockerfile"
install -m 0644 "${repository_root}/deployment/lan/Caddyfile" "${app_target}/Caddyfile"
install -m 0644 "${repository_root}/deployment/lan/.dockerignore" "${app_target}/.dockerignore"

echo "Synchronized the Fustify application build context into ${app_target}."
