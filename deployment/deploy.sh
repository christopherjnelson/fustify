#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "$(id -u)" -eq 0 ]]; then
  echo "Run deployments as the configured Fustify user, not root." >&2
  exit 1
fi

release_root="${FUSTIFY_RELEASE_ROOT:-/srv/fustify}"
releases_root="${release_root}/releases"
current_link="${release_root}/current"
health_url="${FUSTIFY_API_HEALTH_URL:-http://127.0.0.1:8787/api/health}"
commit="$(git rev-parse HEAD)"
release_id="$(date -u +%Y%m%dT%H%M%SZ)-${commit:0:12}"
release_path="${releases_root}/${release_id}"
staging_path="${releases_root}/.staging-${release_id}-$$"
next_link="${release_root}/.current-${release_id}-$$"
previous_release=""

if [[ -e "${release_path}" ]]; then
  echo "Release already exists: ${release_path}" >&2
  exit 1
fi

if [[ -L "${current_link}" ]]; then
  previous_release="$(readlink -f "${current_link}")"
fi

cleanup() {
  if [[ -d "${staging_path}" ]]; then
    rm -rf -- "${staging_path}"
  fi
  if [[ -L "${next_link}" ]]; then
    unlink "${next_link}"
  fi
}
trap cleanup EXIT

health_check() {
  local attempt
  for attempt in {1..20}; do
    if curl --fail --silent --show-error --max-time 2 "${health_url}" \
      | grep --quiet '"status":"ok"'; then
      return 0
    fi
    sleep 1
  done
  return 1
}

rollback() {
  echo "Release health check failed; rolling back." >&2
  if [[ -n "${previous_release}" ]]; then
    case "${previous_release}" in
      "${releases_root}"/*)
        ln -s "${previous_release}" "${next_link}"
        mv -Tf "${next_link}" "${current_link}"
        systemctl --user restart fustify-api.service
        health_check || true
        ;;
      *)
        echo "Refusing rollback to unexpected path: ${previous_release}" >&2
        ;;
    esac
  else
    systemctl --user stop fustify-api.service
    if [[ -L "${current_link}" ]]; then
      unlink "${current_link}"
    fi
  fi
}

pnpm install --frozen-lockfile
FUSTIFY_RELEASE_COMMIT="${commit}" pnpm build:release

mkdir -p "${staging_path}"
cp -a .fustify/release/. "${staging_path}/"
mv "${staging_path}" "${release_path}"
ln -s "${release_path}" "${next_link}"
mv -Tf "${next_link}" "${current_link}"

if ! systemctl --user restart fustify-api.service || ! health_check; then
  rollback
  exit 1
fi

echo "Released Fustify ${commit} to ${release_path}"
