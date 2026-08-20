#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
if [[ "${1:-}" == "--" ]]; then
  shift
fi
runtime_root="${FUSTIFY_LAN_ROOT:-${1:-${script_dir}}}"

[[ -f "${runtime_root}/compose.yaml" && -f "${runtime_root}/.env" ]] || {
  echo "Invalid Fustify LAN project path." >&2
  exit 66
}

cd -- "${runtime_root}"
origin="$(sed -n 's/^FUSTIFY_LAN_ORIGIN=//p' .env | tail -n 1)"
[[ "${origin}" == http://* ]] || {
  echo "FUSTIFY_LAN_ORIGIN must be an HTTP origin." >&2
  exit 78
}

./verify-fustify-runtime.sh "${runtime_root}"

running="$(docker compose ps --status running --services)"
for service in fustify-api caddy; do
  grep -Fxq "${service}" <<<"${running}" || {
    echo "Required LAN service is not running: ${service}" >&2
    exit 69
  }
done

node -e '
  const origin = process.argv[1];
  const publishableKey = process.argv[2];
  const checks = [
    ["Fustify health", `${origin}/health.json`, {}],
    ["Fustify API", `${origin}/api/health`, {}],
    ["Supabase Auth", `${origin}/auth/v1/health`, { apikey: publishableKey }],
  ];
  for (const [name, url, headers] of checks) {
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`${name} returned ${response.status}`);
    console.log(`${name}: ${response.status}`);
  }
  const postgrest = await fetch(`${origin}/rest/v1/rpc/username_options`, {
    method: "POST",
    headers: { apikey: publishableKey, "Content-Type": "application/json" },
    body: JSON.stringify({ p_candidate: "lan-smoke" }),
  });
  if (!postgrest.ok) throw new Error(`PostgREST returned ${postgrest.status}`);
  console.log(`PostgREST: ${postgrest.status}`);
' "${origin}" "$(sed -n 's/^SUPABASE_PUBLISHABLE_KEY=//p' .env | tail -n 1)"

echo "Fustify LAN is healthy at ${origin}."
