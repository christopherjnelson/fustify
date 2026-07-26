#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this one-time setup as root." >&2
  exit 1
fi
if [[ "$#" -ne 1 ]]; then
  echo "Usage: $0 <existing-deploy-user>" >&2
  exit 1
fi

deploy_user="$1"
repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
deploy_home="$(getent passwd "${deploy_user}" | cut -d: -f6)"
deploy_uid="$(id -u "${deploy_user}")"
user_runtime="/run/user/${deploy_uid}"
user_systemd="${deploy_home}/.config/systemd/user"
user_config="${deploy_home}/.config/fustify"

if [[ -z "${deploy_home}" ]]; then
  echo "The deploy user must already exist: ${deploy_user}" >&2
  exit 1
fi
if [[ "$(/usr/bin/node --version)" != v24.* ]]; then
  echo "Node 24 must already be installed at /usr/bin/node." >&2
  exit 1
fi

install -d -m 0755 -o "${deploy_user}" -g "${deploy_user}" \
  /srv/fustify /srv/fustify/releases
install -d -m 0755 -o "${deploy_user}" -g "${deploy_user}" \
  "${user_systemd}" "${user_config}"
install -m 0644 -o "${deploy_user}" -g "${deploy_user}" \
  "${repository_root}/deployment/fustify-api.service" \
  "${user_systemd}/fustify-api.service"
if [[ ! -e "${user_config}/fustify-api.env" ]]; then
  install -m 0600 -o "${deploy_user}" -g "${deploy_user}" \
    "${repository_root}/deployment/fustify-api.env.example" \
    "${user_config}/fustify-api.env"
fi

loginctl enable-linger "${deploy_user}"
runuser -u "${deploy_user}" -- \
  env "XDG_RUNTIME_DIR=${user_runtime}" systemctl --user daemon-reload
runuser -u "${deploy_user}" -- \
  env "XDG_RUNTIME_DIR=${user_runtime}" systemctl --user enable \
  fustify-api.service

echo "The release directories and user service are installed."
echo "Set real secrets in ${user_config}/fustify-api.env before deployment."
