#!/usr/bin/env bash
set -Eeuo pipefail
umask 022

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
script_dir="${repository_root}/deployment"
source "${script_dir}/lib.sh"

deploy_user="${FUSTIFY_DEPLOY_USER:-chris}"
release_root="${FUSTIFY_RELEASE_ROOT:-/srv/fustify}"
production_repository="${FUSTIFY_REPOSITORY:-/srv/fustify/repository}"
deploy_home="$(getent passwd "${deploy_user}" | cut -d: -f6)"
deploy_group="$(id -gn "${deploy_user}")"
user_systemd="${deploy_home}/.config/systemd/user"
user_config="${deploy_home}/.config/fustify"
server_env="${user_config}/fustify-api.env"
deploy_env="${user_config}/deploy.env"

fustify_require_non_root_user "${deploy_user}"
fustify_validate_absolute_path "FUSTIFY_RELEASE_ROOT" "${release_root}"
fustify_validate_absolute_path "FUSTIFY_REPOSITORY" "${production_repository}"
if [[ -z "${deploy_home}" || ! -d "${deploy_home}" ]]; then
  fustify_error "The deploy user must already have a home directory: ${deploy_user}"
  exit 1
fi
if [[ "$(/usr/local/bin/node --version)" != v24.* ]]; then
  fustify_error "Node 24 must already be installed at /usr/local/bin/node."
  exit 1
fi

sudo install -d -m 0755 -o "${deploy_user}" -g "${deploy_group}" \
  "${release_root}" "${release_root}/releases"
install -d -m 0755 "${user_systemd}" "${user_config}"
install -m 0644 "${script_dir}/fustify-api.service" \
  "${user_systemd}/fustify-api.service"
if [[ ! -e "${server_env}" ]]; then
  install -m 0600 "${script_dir}/fustify-api.env.example" "${server_env}"
fi
if [[ ! -e "${deploy_env}" ]]; then
  install -m 0600 "${script_dir}/deploy.env.example" "${deploy_env}"
fi
chmod 0600 "${server_env}" "${deploy_env}"

# A known compat.conf can remain: every value is a harmless explicit false
# override of directives intentionally absent from the compatible base unit.
if command -v systemd-analyze >/dev/null 2>&1 &&
  systemd-analyze --help 2>&1 | grep --quiet -- '--user'; then
  systemd-analyze --user verify "${user_systemd}/fustify-api.service"
fi
systemctl --user daemon-reload
systemctl --user enable fustify-api.service
sudo loginctl enable-linger "${deploy_user}"

# This is the only privileged installation performed by the operator-command
# installer. The installed command itself always runs Git, pnpm, and systemd as
# the invoking non-root deploy user.
sudo install -m 0755 -o root -g root \
  "${script_dir}/fustify-deploy" /usr/local/bin/fustify-deploy
sudo install -d -m 0755 -o root -g root /usr/local/lib
sudo install -m 0644 -o root -g root \
  "${script_dir}/lib.sh" /usr/local/lib/fustify-deploy-lib.sh

printf 'Installed Fustify release directories, user service, and operator command.\n'
printf 'Review the private environment files under %s before deployment.\n' \
  "${user_config}"
