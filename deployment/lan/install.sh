#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
repository_root="$(cd -- "${script_dir}/../.." && pwd -P)"
if [[ "${1:-}" == "--" ]]; then
  shift
fi
target="${1:-}"
origin="${2:-http://127.0.0.1:8080}"

if [[ -z "${target}" || "${target}" != /* || "${target}" == "/" ]]; then
  echo "Usage: $0 /absolute/empty/arcane-project-directory [http://lan-host:port]" >&2
  exit 64
fi

for command in docker git install node openssl sed; do
  command -v "${command}" >/dev/null || {
    echo "Missing required command: ${command}" >&2
    exit 69
  }
done

origin_details="$(node -e '
  const value = process.argv[1];
  const url = new URL(value);
  if (url.protocol !== "http:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    process.exit(1);
  }
  const port = url.port || "80";
  if (!Number.isSafeInteger(Number(port)) || Number(port) < 1 || Number(port) > 65535) process.exit(1);
  process.stdout.write(`${url.origin}\n${port}`);
' "${origin}")" || {
  echo "LAN origin must be an HTTP origin without a path, query, or credentials." >&2
  exit 64
}
origin="$(sed -n '1p' <<<"${origin_details}")"
lan_port="$(sed -n '2p' <<<"${origin_details}")"

bash "${repository_root}/deployment/self-hosted-supabase/install.sh" "${target}"
install -m 0644 "${script_dir}/compose.yaml" "${target}/compose.yaml"

set_env() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" "${target}/.env"; then
    sed -i -e "s|^${key}=.*$|${key}=${value}|g" "${target}/.env"
  else
    printf '%s=%s\n' "${key}" "${value}" >>"${target}/.env"
  fi
}

(
  cd -- "${target}"
  sh utils/generate-keys.sh --update-env >/dev/null
  sh utils/add-new-auth-keys.sh --update-env >/dev/null
)

disabled_secret="$(openssl rand -hex 32)"
set_env COMPOSE_FILE compose.yaml
set_env COMPOSE_PROJECT_NAME fustify-lan
set_env FUSTIFY_LAN_ORIGIN "${origin}"
set_env FUSTIFY_LAN_BIND_ADDRESS 0.0.0.0
set_env FUSTIFY_LAN_PORT "${lan_port}"
set_env FUSTIFY_LAN_POSTGRES_PORT 15432
set_env FUSTIFY_LAN_POOLER_PORT 16543
set_env FUSTIFY_SUPABASE_DOMAIN unused.local
set_env SUPABASE_PUBLIC_URL "${origin}"
set_env API_EXTERNAL_URL "${origin}/auth/v1"
set_env SITE_URL "${origin}"
set_env ADDITIONAL_REDIRECT_URLS "${origin}/auth/callback,${origin}/auth/reset-password"
set_env ENABLE_ANONYMOUS_USERS false
set_env ENABLE_EMAIL_SIGNUP true
set_env ENABLE_EMAIL_AUTOCONFIRM true
set_env ENABLE_PHONE_SIGNUP false
set_env ENABLE_PHONE_AUTOCONFIRM false
set_env SMTP_ADMIN_EMAIL lan-disabled@fustify.invalid
set_env SMTP_HOST 127.0.0.1
set_env SMTP_PORT 2525
set_env SMTP_USER lan-disabled
set_env SMTP_PASS "${disabled_secret}"
set_env SMTP_SENDER_NAME Fustify-LAN
set_env DISCORD_ENABLED false
set_env DISCORD_CLIENT_ID lan-disabled
set_env DISCORD_CLIENT_SECRET "${disabled_secret}"
set_env DISCORD_WEBHOOK lan-disabled
set_env DISCORD_ROOM_ANNOUNCEMENT_INVOCATION_SECRET "${disabled_secret}"
set_env STUDIO_DEFAULT_ORGANIZATION Fustify-LAN
set_env STUDIO_DEFAULT_PROJECT Fustify-LAN
set_env OPENAI_API_KEY ''
set_env POOLER_TENANT_ID fustify-lan
set_env STORAGE_TENANT_ID fustify-lan
set_env GLOBAL_S3_BUCKET fustify-lan
set_env REGION local
set_env FUNCTIONS_VERIFY_JWT false
set_env PGRST_DB_SCHEMAS public,graphql_public
set_env PGRST_DB_EXTRA_SEARCH_PATH public,extensions
set_env FUSTIFY_ADMIN_MUTATIONS_ENABLED 0

bash "${script_dir}/copy-app-source.sh" "${repository_root}" "${target}"
install -m 0755 "${script_dir}/verify.sh" "${target}/verify-lan.sh"
chmod 0600 "${target}/.env"
rm -f -- "${target}/.env.old" "${target}/docker-compose.yml.old"

FUSTIFY_SUPABASE_ROOT="${target}" "${target}/validate-fustify.sh"

echo
echo "Installed the Fustify LAN project at ${target}."
echo "Arcane can now discover compose.yaml and start or stop the entire project."
echo "LAN URL: ${origin}"
echo "CLI start: cd ${target} && docker compose up -d --build --wait"
