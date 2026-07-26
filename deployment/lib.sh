#!/usr/bin/env bash

fustify_error() {
  printf 'ERROR: %s\n' "$*" >&2
}

fustify_require_non_root_user() {
  local expected_user="$1"
  if [[ "$(id -u)" -eq 0 ]]; then
    fustify_error "Run this command as ${expected_user}, not root."
    return 1
  fi
  if [[ "$(id -un)" != "${expected_user}" ]]; then
    fustify_error "Run this command as ${expected_user}."
    return 1
  fi
}

fustify_validate_absolute_path() {
  local label="$1"
  local path="$2"
  if [[ -z "${path}" || "${path}" != /* || "${path}" == "/" ]]; then
    fustify_error "${label} must be a non-root absolute path."
    return 1
  fi
  if [[ "${path}" == *$'\n'* || "/${path#/}/" == *"/../"* ]]; then
    fustify_error "${label} contains an unsafe path component."
    return 1
  fi
}

fustify_env_has_value() {
  local file="$1"
  local key="$2"
  awk -v key="${key}" '
    /^[[:space:]]*(#|$)/ { next }
    {
      line = $0
      sub(/^[[:space:]]*export[[:space:]]+/, "", line)
      separator = index(line, "=")
      if (separator == 0) next
      name = substr(line, 1, separator - 1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", name)
      if (name != key) next
      value = substr(line, separator + 1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      first = substr(value, 1, 1)
      last = substr(value, length(value), 1)
      if ((first == "\"" && last == "\"") || (first == "\047" && last == "\047")) {
        value = substr(value, 2, length(value) - 2)
      }
      effective = value
      found = 1
    }
    END { exit found && length(effective) > 0 ? 0 : 1 }
  ' "${file}"
}

fustify_read_env_value() {
  local file="$1"
  local key="$2"
  awk -v key="${key}" '
    /^[[:space:]]*(#|$)/ { next }
    {
      line = $0
      sub(/^[[:space:]]*export[[:space:]]+/, "", line)
      separator = index(line, "=")
      if (separator == 0) next
      name = substr(line, 1, separator - 1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", name)
      if (name != key) next
      value = substr(line, separator + 1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      first = substr(value, 1, 1)
      last = substr(value, length(value), 1)
      if ((first == "\"" && last == "\"") || (first == "\047" && last == "\047")) {
        value = substr(value, 2, length(value) - 2)
      }
      effective = value
      found = 1
    }
    END {
      if (!found) exit 1
      print effective
    }
  ' "${file}"
}

fustify_require_private_environment() {
  local file="$1"
  shift
  local key
  local mode
  local mode_value

  if [[ ! -f "${file}" || -L "${file}" ]]; then
    fustify_error "Required environment file is missing or is a symlink: ${file}"
    return 1
  fi
  mode="$(stat -c '%a' "${file}")"
  mode_value=$((8#${mode}))
  if ((mode_value & 0077)); then
    fustify_error "Environment file must not be accessible by group or other users: ${file}"
    return 1
  fi
  for key in "$@"; do
    if ! fustify_env_has_value "${file}" "${key}"; then
      fustify_error "Required variable ${key} is missing or empty in ${file}."
      return 1
    fi
  done
}

fustify_direct_child_path() {
  local parent="$1"
  local candidate="$2"
  local canonical_parent
  local canonical_candidate

  canonical_parent="$(realpath -e "${parent}")" || return 1
  canonical_candidate="$(realpath -e "${candidate}")" || return 1
  [[ "$(dirname "${canonical_candidate}")" == "${canonical_parent}" ]]
}
