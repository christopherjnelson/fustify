#!/usr/bin/env bash
set -Eeuo pipefail

source_path="${1:-}"
destination_path="${2:-}"
if [[ -z "${source_path}" || -z "${destination_path}" ]]; then
  echo "Usage: $0 hosted-rclone-remote:path self-hosted-rclone-remote:path" >&2
  exit 64
fi
command -v rclone >/dev/null || { echo "rclone is required." >&2; exit 69; }

if [[ "${FUSTIFY_STORAGE_COPY_APPLY:-0}" != 1 ]]; then
  echo "Dry run only. Set FUSTIFY_STORAGE_COPY_APPLY=1 after reviewing this output."
  exec rclone sync --dry-run --checksum --create-empty-src-dirs -- "${source_path}" "${destination_path}"
fi

rclone sync --checksum --create-empty-src-dirs -- "${source_path}" "${destination_path}"
echo "Storage object transfer completed."
