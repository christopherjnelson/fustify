#!/usr/bin/env bash
set -Eeuo pipefail
umask 022

if [[ "$(id -u)" -eq 0 ]]; then
  echo "Run this installer as the normal operator; it uses sudo where required." >&2
  exit 1
fi

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_fragment="${repository_root}/deployment/fustify.caddy"
caddyfile="${FUSTIFY_CADDYFILE:-/etc/caddy/Caddyfile}"
sites_dir="${FUSTIFY_CADDY_SITES_DIR:-/etc/caddy/sites}"
managed_fragment="${sites_dir}/fustify.caddy"
backup_dir="${FUSTIFY_CADDY_BACKUP_DIR:-/etc/caddy/backups}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup="${backup_dir}/fustify.caddy.${timestamp}"
caddyfile_backup="${backup_dir}/Caddyfile.${timestamp}"
had_existing=0

restore_fragment() {
  if ((had_existing)); then
    sudo install -m 0644 -o root -g root "${backup}" "${managed_fragment}" ||
      return 1
  else
    sudo rm -f -- "${managed_fragment}" || return 1
  fi
  sudo caddy validate --config "${caddyfile}" || return 1
  sudo systemctl reload caddy
}

if ! sudo grep --quiet --fixed-strings --line-regexp \
  "import ${sites_dir}/*.caddy" "${caddyfile}" &&
  ! sudo grep --quiet --fixed-strings --line-regexp \
    "import ${managed_fragment}" "${caddyfile}"; then
  echo "Refusing to edit an unrelated Caddyfile." >&2
  echo "Add this reviewed import once, then rerun the installer:" >&2
  echo "import /etc/caddy/sites/*.caddy" >&2
  exit 1
fi

sudo install -d -m 0755 -o root -g root "${sites_dir}" "${backup_dir}"
sudo cp -a -- "${caddyfile}" "${caddyfile_backup}"
if sudo test -e "${managed_fragment}"; then
  had_existing=1
  sudo cp -a -- "${managed_fragment}" "${backup}"
else
  sudo install -m 0644 -o root -g root /dev/null "${backup}"
fi
sudo install -m 0644 -o root -g root "${source_fragment}" "${managed_fragment}"

if ! sudo caddy validate --config "${caddyfile}"; then
  echo "Caddy validation failed; restoring the prior managed fragment." >&2
  if ! restore_fragment; then
    echo "The prior Caddy configuration could not be reactivated." >&2
  fi
  exit 1
fi
if ! sudo systemctl reload caddy; then
  echo "Caddy reload failed; restoring and reloading the prior configuration." >&2
  if ! restore_fragment; then
    echo "The prior Caddy configuration could not be reactivated." >&2
  fi
  exit 1
fi

printf 'Installed and activated the managed Fustify Caddy fragment.\n'
printf 'Backup: %s\n' "${backup}"
