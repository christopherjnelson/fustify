#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
runtime_root="${FUSTIFY_SUPABASE_ROOT:-${1:-${script_dir}}}"
expected_commit="241bb11c0627f2981746d37033f57dbfa81d29b0"

required=(docker-compose.yml docker-compose.fustify.yml Caddyfile.fustify .env .supabase-version)
for relative in "${required[@]}"; do
  [[ -f "${runtime_root}/${relative}" ]] || {
    echo "Missing ${runtime_root}/${relative}" >&2
    exit 66
  }
done
[[ -x "${runtime_root}/volumes/db/fustify-apply-migrations.sh" ]] || {
  echo "Missing Fustify migration runner." >&2
  exit 66
}
[[ -f "${runtime_root}/volumes/fustify-src/core/game/gameReducer.ts" ]] || {
  echo "Missing shared Edge Function application source." >&2
  exit 66
}

if ! grep -Fxq "commit=${expected_commit}" "${runtime_root}/.supabase-version"; then
  echo "The installed Supabase release is not the reviewed commit ${expected_commit}." >&2
  exit 65
fi

if grep -Eq '(^|=)(replace_|your-super-secret|this_password_is_insecure|sk-proj-xxxxxxxx|supabase\.example\.com)' "${runtime_root}/.env"; then
  echo "Unsafe placeholder remains in ${runtime_root}/.env." >&2
  exit 78
fi

env_value() {
  sed -n "s/^${1}=//p" "${runtime_root}/.env" | tail -n 1
}
for variable in \
  POSTGRES_PASSWORD JWT_SECRET SUPABASE_PUBLISHABLE_KEY SUPABASE_SECRET_KEY \
  DASHBOARD_PASSWORD SECRET_KEY_BASE REALTIME_DB_ENC_KEY VAULT_ENC_KEY \
  PG_META_CRYPTO_KEY FUSTIFY_SUPABASE_DOMAIN SUPABASE_PUBLIC_URL \
  API_EXTERNAL_URL SITE_URL SMTP_HOST SMTP_USER SMTP_PASS \
  DISCORD_CLIENT_ID DISCORD_CLIENT_SECRET DISCORD_WEBHOOK \
  DISCORD_ROOM_ANNOUNCEMENT_INVOCATION_SECRET; do
  value="$(env_value "${variable}")"
  if [[ -z "${value}" ]]; then
    echo "Required value ${variable} is empty in ${runtime_root}/.env." >&2
    exit 78
  fi
done

for function_name in announce-public-room complete-discord-profile multiplayer-game; do
  [[ -f "${runtime_root}/volumes/functions/${function_name}/index.ts" ]] || {
    echo "Missing Edge Function ${function_name}." >&2
    exit 66
  }
done

(cd -- "${runtime_root}" && docker compose config --quiet)
echo "Self-hosted Supabase configuration is structurally valid."
