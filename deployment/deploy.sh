#!/usr/bin/env bash
set -Eeuo pipefail
umask 022

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${script_dir}/lib.sh"

expected_user="${FUSTIFY_DEPLOY_USER:-chris}"
release_root="${FUSTIFY_RELEASE_ROOT:-/srv/fustify}"
release_root="${release_root%/}"
releases_root="${release_root}/releases"
current_link="${FUSTIFY_CURRENT_LINK:-${release_root}/current}"
frontend_env="${FUSTIFY_FRONTEND_ENV:-$(pwd)/.env.production.local}"
server_env="${FUSTIFY_SERVER_ENV:-${HOME}/.config/fustify/fustify-api.env}"
public_origin="${FUSTIFY_PUBLIC_ORIGIN:-https://dev.fustify.com}"
health_url="${FUSTIFY_API_HEALTH_URL:-http://127.0.0.1:8787/api/health}"
service_name="${FUSTIFY_API_SERVICE:-fustify-api.service}"
health_attempts="${FUSTIFY_HEALTH_ATTEMPTS:-20}"
health_delay="${FUSTIFY_HEALTH_DELAY_SECONDS:-1}"
retention="${FUSTIFY_RELEASE_RETENTION:-5}"
notify_command="${FUSTIFY_NOTIFY_COMMAND:-}"
checks_ran=""
current_stage="initialization"
commit="unknown"
release_path=""
staging_path=""
next_link=""
previous_release=""
previous_commit=""
activated=0
rollback_required=0
failure_handled=0
staging_created=0
next_link_created=0

validate_integer_range() {
  local label="$1"
  local value="$2"
  local minimum="$3"
  local maximum="$4"
  if [[ ! "${value}" =~ ^[0-9]+$ ]] ||
    ((value < minimum || value > maximum)); then
    fustify_error "${label} must be an integer from ${minimum} through ${maximum}."
    return 1
  fi
}

fail_deployment() {
  fustify_error "$*"
  return 1
}

validate_release_directory() {
  local candidate="$1"
  local basename
  basename="$(basename "${candidate}")"
  if [[ ! "${basename}" =~ ^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}(-[0-9]+)?$ ]]; then
    fustify_error "Refusing unsafe release path: ${candidate}"
    return 1
  fi
  if ! fustify_direct_child_path "${releases_root}" "${candidate}"; then
    fustify_error "Release is not a direct child of ${releases_root}: ${candidate}"
    return 1
  fi
}

validate_combined_release() {
  local candidate="$1"
  validate_release_directory "${candidate}"
  if [[ ! -f "${candidate}/web/index.html" || ! -f "${candidate}/api/server.mjs" ]]; then
    fustify_error "Release does not contain the combined web/API layout: ${candidate}"
    return 1
  fi
}

cleanup() {
  set +e
  if ((staging_created)) && [[ -n "${staging_path}" && -d "${staging_path}" ]]; then
    if [[ "$(basename "${staging_path}")" == .staging-* ]] &&
      fustify_direct_child_path "${releases_root}" "${staging_path}"; then
      rm -rf -- "${staging_path}"
    else
      fustify_error "Refusing to clean unsafe staging path: ${staging_path}"
    fi
  fi
  if ((next_link_created)) && [[ -n "${next_link}" && -L "${next_link}" ]]; then
    if [[ "$(dirname "${next_link}")" == "${release_root}" &&
      "$(basename "${next_link}")" == .current-* ]]; then
      unlink "${next_link}"
    else
      fustify_error "Refusing to clean unsafe temporary link: ${next_link}"
    fi
  fi
}

health_check() {
  local attempt
  local body
  for ((attempt = 1; attempt <= health_attempts; attempt += 1)); do
    if body="$(curl --fail --silent --max-time 2 "${health_url}" 2>/dev/null)" &&
      grep --quiet --extended-regexp '"status"[[:space:]]*:[[:space:]]*"ok"' <<<"${body}"; then
      return 0
    fi
    if ((attempt < health_attempts)); then
      sleep "${health_delay}"
    fi
  done
  return 1
}

http_status_is() {
  local url="$1"
  local expected="$2"
  local status
  status="$(
    curl --silent --output /dev/null --write-out '%{http_code}' \
      --max-time 10 "${url}" 2>/dev/null
  )" || return 1
  [[ "${status}" == "${expected}" ]]
}

verify_public_surface() {
  local body
  body="$(curl --fail --silent --max-time 10 "${public_origin}/api/health" 2>/dev/null)" &&
    grep --quiet --extended-regexp '"status"[[:space:]]*:[[:space:]]*"ok"' <<<"${body}" ||
    return 1
  http_status_is "${public_origin}/" "200" || return 1
  http_status_is "${public_origin}/multiplayer" "200" || return 1
  http_status_is "${public_origin}/admin" "200" || return 1
  http_status_is "${public_origin}/.env" "404" || return 1
  http_status_is "${public_origin}/.git/config" "404" || return 1
  http_status_is "${public_origin}/src/main.tsx" "404" || return 1
  http_status_is "${public_origin}/node_modules/" "404" || return 1
  http_status_is "${public_origin}/assets/app.js.map" "404" || return 1
}

verify_public_metadata() {
  local expected_commit="$1"
  local body
  body="$(curl --fail --silent --max-time 10 "${public_origin}/release.json" 2>/dev/null)" ||
    return 1
  grep --quiet --extended-regexp \
    "\"commit\"[[:space:]]*:[[:space:]]*\"${expected_commit}\"" <<<"${body}"
}

verify_public_release() {
  local expected_commit="$1"
  verify_public_surface &&
    verify_public_metadata "${expected_commit}"
}

service_diagnostics() {
  printf 'The API did not become healthy within the bounded startup window.\n' >&2
  systemctl --user status "${service_name}" --no-pager --lines=20 >&2 || true
  printf 'More logs: journalctl --user -u %s -n 100 --no-pager\n' \
    "${service_name}" >&2
}

send_notification() {
  local event="$1"
  local stage="$2"
  local rollback="$3"
  local summary="$4"
  if [[ -n "${notify_command}" ]]; then
    "${notify_command}" "${event}" "${commit}" "${stage}" "${rollback}" \
      "${checks_ran}" "${summary}"
  else
    /usr/local/bin/node "${script_dir}/notify.mjs" "${event}" "${commit}" \
      "${stage}" "${rollback}" "${checks_ran}" "${summary}"
  fi
}

rollback() {
  local rollback_link
  if [[ -z "${previous_release}" ]]; then
    systemctl --user stop "${service_name}" || true
    if [[ -L "${current_link}" ]]; then
      unlink "${current_link}" || return 1
    fi
    fustify_error "No previous release was available; the failed release was deactivated."
    return 1
  fi
  validate_combined_release "${previous_release}" || return 1
  rollback_link="${release_root}/.current-rollback-$$"
  [[ ! -e "${rollback_link}" && ! -L "${rollback_link}" ]] || return 1
  ln -s "${previous_release}" "${rollback_link}" || return 1
  mv -Tf "${rollback_link}" "${current_link}" || return 1
  systemctl --user restart "${service_name}" || return 1
  verify_rollback_release "${previous_release}" "${previous_commit}" || return 1
}

read_release_commit() {
  local metadata="$1"
  grep --only-matching --extended-regexp \
    '"commit"[[:space:]]*:[[:space:]]*"[0-9a-f]{40}"' "${metadata}" |
    sed -nE 's/.*"([0-9a-f]{40})"$/\1/p' |
    head -n 1
}

verify_private_release_metadata() {
  local release="$1"
  local expected_commit="$2"
  local actual_commit
  actual_commit="$(read_release_commit "${release}/release.json")"
  [[ "${actual_commit}" == "${expected_commit}" ]] || return 1
  [[ "$(basename "${release}")" == *-"${expected_commit:0:12}" ||
    "$(basename "${release}")" == *-"${expected_commit:0:12}"-[0-9]* ]]
}

verify_rollback_release() {
  local expected_release="$1"
  local expected_commit="$2"
  local active_release
  active_release="$(readlink -f "${current_link}")" || return 1
  [[ "${active_release}" == "${expected_release}" ]] || return 1
  verify_private_release_metadata "${expected_release}" "${expected_commit}" ||
    return 1
  health_check || return 1
  verify_public_surface || return 1
  if [[ -f "${expected_release}/web/release.json" ]]; then
    verify_public_metadata "${expected_commit}" || return 1
  else
    printf 'Rollback compatibility: verified legacy release %s using private metadata; public release metadata is unavailable.\n' \
      "$(basename "${expected_release}")"
  fi
}

on_error() {
  local exit_code="$?"
  local rollback_result="not required"
  if ((failure_handled)); then
    exit "${exit_code}"
  fi
  failure_handled=1
  trap - ERR
  set +e
  fustify_error "Deployment failed during stage: ${current_stage}"
  if ((rollback_required && activated)); then
    if rollback; then
      rollback_result="succeeded"
      fustify_error "Rollback succeeded and the previous release was verified."
    else
      rollback_result="FAILED"
      fustify_error "ROLLBACK VERIFICATION FAILED; inspect the service and public site immediately."
    fi
  fi
  if ! send_notification failure "${current_stage}" "${rollback_result}" ""; then
    fustify_error "Failure notification could not be sent."
  fi
  cleanup
  exit "${exit_code}"
}

trap on_error ERR
trap cleanup EXIT

current_stage="configuration validation"
fustify_require_non_root_user "${expected_user}"
fustify_validate_absolute_path "FUSTIFY_RELEASE_ROOT" "${release_root}"
fustify_validate_absolute_path "FUSTIFY_CURRENT_LINK" "${current_link}"
if [[ "${current_link}" != "${release_root}/current" ]]; then
  fail_deployment "FUSTIFY_CURRENT_LINK must be ${release_root}/current."
fi
validate_integer_range "FUSTIFY_HEALTH_ATTEMPTS" "${health_attempts}" 1 60
validate_integer_range "FUSTIFY_HEALTH_DELAY_SECONDS" "${health_delay}" 0 10
validate_integer_range "FUSTIFY_RELEASE_RETENTION" "${retention}" 2 100
if [[ ! "${public_origin}" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?$ ]]; then
  fail_deployment "FUSTIFY_PUBLIC_ORIGIN must be an HTTPS origin without a path."
fi
if [[ ! "${health_url}" =~ ^http://127\.0\.0\.1:[0-9]+/api/health$ ]]; then
  fail_deployment "FUSTIFY_API_HEALTH_URL must use loopback and /api/health."
fi
if [[ ! "${service_name}" =~ ^[A-Za-z0-9@_.-]+\.service$ ]]; then
  fail_deployment "FUSTIFY_API_SERVICE contains unsupported characters."
fi
if [[ ! -d "${release_root}" || -L "${release_root}" ]]; then
  fail_deployment "Release root must be an existing real directory: ${release_root}"
fi
if [[ ! -d "${releases_root}" || -L "${releases_root}" ]]; then
  fail_deployment "Releases root must be an existing real directory: ${releases_root}"
fi
if [[ "$(realpath -e "${release_root}")" != "${release_root}" ||
  "$(realpath -e "${releases_root}")" != "${releases_root}" ]]; then
  fail_deployment "Release paths must already be canonical and may not traverse symlinks."
fi
chmod 0755 "${release_root}" "${releases_root}"
fustify_require_private_environment \
  "${frontend_env}" VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY
fustify_require_private_environment \
  "${server_env}" SUPABASE_URL SUPABASE_PUBLISHABLE_KEY SUPABASE_SERVICE_ROLE_KEY

commit="$(git rev-parse HEAD)"
if [[ ! "${commit}" =~ ^[0-9a-f]{40}$ ]]; then
  fail_deployment "Git did not return a full commit hash."
fi
if [[ -L "${current_link}" ]]; then
  previous_release="$(readlink -f "${current_link}")"
  validate_combined_release "${previous_release}"
  previous_commit="$(read_release_commit "${previous_release}/release.json")"
  if [[ ! "${previous_commit}" =~ ^[0-9a-f]{40}$ ]]; then
    fail_deployment "Previous release metadata does not contain a full commit hash."
  fi
elif [[ -e "${current_link}" ]]; then
  fail_deployment "Current release path exists but is not a symlink: ${current_link}"
fi

current_stage="dependency installation"
pnpm install --frozen-lockfile
checks_ran="frozen install"

current_stage="format check"
pnpm format:check
checks_ran="${checks_ran}, format"

current_stage="lint"
pnpm lint
checks_ran="${checks_ran}, lint"

current_stage="complete Vitest suite"
pnpm exec vitest run --testTimeout=15000
checks_ran="${checks_ran}, Vitest (15s timeout)"

current_stage="deployment helper tests"
pnpm test:deployment
checks_ran="${checks_ran}, deployment helper tests"

current_stage="Vite-to-Node integration"
pnpm test:integration:dev-proxy
checks_ran="${checks_ran}, Vite-to-Node integration"

release_timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
release_built_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
base_release_id="${release_timestamp}-${commit:0:12}"
release_id="${base_release_id}"
collision=0
while [[ -e "${releases_root}/${release_id}" ||
  -L "${releases_root}/${release_id}" ]]; do
  collision=$((collision + 1))
  release_id="${base_release_id}-${collision}"
  if ((collision > 99)); then
    fail_deployment "Could not allocate a unique release identifier."
  fi
done
release_path="${releases_root}/${release_id}"
staging_path="${releases_root}/.staging-${release_id}-$$"
next_link="${release_root}/.current-${release_id}-$$"

current_stage="combined release build"
FUSTIFY_RELEASE_COMMIT="${commit}" \
  FUSTIFY_RELEASE_ID="${release_id}" \
  FUSTIFY_RELEASE_BUILT_AT="${release_built_at}" \
  pnpm build:release
checks_ran="${checks_ran}, combined web/API build"

current_stage="bundle budget"
pnpm bundle:check
checks_ran="${checks_ran}, bundle budget"

current_stage="release packaging"
if [[ ! -f .fustify/release/web/index.html ||
  ! -f .fustify/release/api/server.mjs ||
  ! -f .fustify/release/release.json ||
  ! -f .fustify/release/web/release.json ]]; then
  fail_deployment "Combined release artifacts are incomplete."
fi
mkdir "${staging_path}"
staging_created=1
cp -a .fustify/release/. "${staging_path}/"
find "${staging_path}/web" -type d -exec chmod 0755 {} +
find "${staging_path}/web" -type f -exec chmod 0644 {} +
find "${staging_path}/api" -type d -exec chmod 0700 {} +
find "${staging_path}/api" -type f -exec chmod 0600 {} +
chmod 0755 "${staging_path}"
chmod 0644 "${staging_path}/release.json"
mv "${staging_path}" "${release_path}"
staging_created=0
validate_combined_release "${release_path}"

current_stage="release activation"
rollback_required=1
ln -s "${release_path}" "${next_link}"
next_link_created=1
mv -Tf "${next_link}" "${current_link}"
next_link_created=0
activated=1
systemctl --user restart "${service_name}"

current_stage="local API health"
if ! health_check; then
  service_diagnostics
  false
fi
checks_ran="${checks_ran}, local API health"

current_stage="public deployment verification"
verify_public_release "${commit}"
checks_ran="${checks_ran}, public API/routes/sensitive paths/commit"
rollback_required=0

current_stage="release retention"
mapfile -t release_candidates < <(
  find -P "${releases_root}" -mindepth 1 -maxdepth 1 -type d \
    -printf '%f\n' |
    sort -r
)
retained=0
active_release="$(readlink -f "${current_link}")"
for release_name in "${release_candidates[@]}"; do
  candidate="${releases_root}/${release_name}"
  if [[ ! "${release_name}" =~ ^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}(-[0-9]+)?$ ]]; then
    continue
  fi
  validate_release_directory "${candidate}"
  if ((retained < retention)) ||
    [[ "${candidate}" == "${active_release}" || "${candidate}" == "${previous_release}" ]]; then
    retained=$((retained + 1))
    continue
  fi
  rm -rf -- "${candidate}"
done

current_stage="success notification"
deployment_summary="$(git log -1 --pretty=%s)"
if ! send_notification success "${current_stage}" "not required" "${deployment_summary}"; then
  fustify_error "Deployment is healthy, but the success notification could not be sent."
fi

printf 'Released Fustify %s to %s\n' "${commit}" "${release_path}"
