#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
repository_root="$(cd -- "${script_dir}/../.." && pwd -P)"
target="${1:-}"
release="$(sed -n '1p' "${script_dir}/VERSION")"
commit="$(sed -n '2p' "${script_dir}/VERSION")"

if [[ -z "${target}" || "${target}" != /* || "${target}" == "/" ]]; then
  echo "Usage: $0 /absolute/empty/target-directory" >&2
  exit 64
fi
if [[ -e "${target}" ]] && [[ -n "$(find "${target}" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]]; then
  echo "Target must be absent or empty: ${target}" >&2
  exit 65
fi

for command in git docker install cp sed find; do
  command -v "${command}" >/dev/null || {
    echo "Missing required command: ${command}" >&2
    exit 69
  }
done

temporary_root="$(mktemp -d -t fustify-supabase-install.XXXXXXXX)"
trap 'rm -rf -- "${temporary_root}"' EXIT

git clone --filter=blob:none --no-checkout --quiet \
  https://github.com/supabase/supabase.git "${temporary_root}/upstream"
git -C "${temporary_root}/upstream" sparse-checkout init --cone
git -C "${temporary_root}/upstream" sparse-checkout set docker
git -C "${temporary_root}/upstream" checkout --quiet "${commit}"

resolved="$(git -C "${temporary_root}/upstream" rev-parse HEAD)"
if [[ "${resolved}" != "${commit}" ]]; then
  echo "Pinned Supabase commit mismatch." >&2
  exit 70
fi

mkdir -p -- "${target}"
cp -a -- "${temporary_root}/upstream/docker/." "${target}/"
mkdir -p -- "${target}/volumes/db/custom"
mkdir -p -- "${target}/volumes/db/fustify-migrations"
mkdir -p -- "${target}/volumes/fustify-src"
install -m 0644 "${script_dir}/docker-compose.fustify.yml" "${target}/docker-compose.fustify.yml"
install -m 0644 "${script_dir}/Caddyfile.fustify" "${target}/Caddyfile.fustify"
install -m 0600 "${script_dir}/backup.env.example" "${target}/.env.backup.example"
install -m 0600 "${target}/.env.example" "${target}/.env"
printf '\n# Fustify production overlay\n' >>"${target}/.env"
sed '/^[[:space:]]*#/d; /^[[:space:]]*$/d' "${script_dir}/fustify.env.example" >>"${target}/.env"
printf 'ref=%s\ncommit=%s\n' "${release}" "${commit}" >"${target}/.supabase-version"

for function_name in announce-public-room complete-discord-profile multiplayer-game; do
  rm -rf -- "${target}/volumes/functions/${function_name}"
  cp -a -- "${repository_root}/supabase/functions/${function_name}" \
    "${target}/volumes/functions/${function_name}"
done
cp -a -- "${repository_root}/src/." "${target}/volumes/fustify-src/"

for migration in "${repository_root}"/supabase/migrations/*.sql; do
  install -m 0644 "${migration}" "${target}/volumes/db/fustify-migrations/$(basename -- "${migration}")"
done
install -m 0755 "${script_dir}/apply-migrations.sh" \
  "${target}/volumes/db/fustify-apply-migrations.sh"

install -m 0755 "${script_dir}/sync-functions.sh" "${target}/sync-functions.sh"
install -m 0755 "${script_dir}/validate.sh" "${target}/validate-fustify.sh"
install -m 0755 "${script_dir}/verify-runtime.sh" "${target}/verify-fustify-runtime.sh"
install -m 0755 "${script_dir}/backup.sh" "${target}/backup-fustify.sh"
install -m 0755 "${script_dir}/restore-backup.sh" "${target}/restore-fustify-backup.sh"
install -m 0755 "${script_dir}/restore-platform.sh" "${target}/restore-platform.sh"
install -m 0755 "${script_dir}/copy-storage.sh" "${target}/copy-storage.sh"

echo "Installed ${release} (${commit}) at ${target}."
echo "Run the upstream key generators, replace every placeholder in .env, then run ./validate-fustify.sh."
