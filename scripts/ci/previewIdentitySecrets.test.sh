#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/previewIdentitySecrets.sh"
warn() { printf '%s\n' "$*" >&2; }
note() { :; }
_existing() { [[ -n "${LOCAL_VALUE:-}" ]] && printf '%s' "$LOCAL_VALUE"; }
ask_secret() { printf -v "$1" '%s' "${PASTED_VALUE:-}"; }
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
gen_secret() { echo generated >> "$tmp/generations"; echo new-fixture-secret; }
curl() {
  printf '%s\n' "$*" >> "$tmp/requests"
  if [[ "${FAIL_INVENTORY:-0}" == 1 ]]; then return 22; fi
  echo '{"envs":[{"key":"KEY_VAULTS_SECRET","target":["preview"]}]}'
}
gh() { echo PREVIEW_KEY_VAULTS_SECRET; }
VERCEL_TOKEN=fixture; VERCEL_PROJECT_ID=fixture; VERCEL_ORG_ID=fixture
load_preview_identity_inventory
if resolve_preview_identity_secret KEY_VAULTS_SECRET resolved 2>/dev/null; then exit 1; fi
[[ ! -e "$tmp/generations" ]]
PASTED_VALUE=original-fixture
resolve_preview_identity_secret KEY_VAULTS_SECRET resolved
[[ "$resolved" == original-fixture ]]
publish_preview_identity_secret KEY_VAULTS_SECRET "$resolved"
! grep -q POST "$tmp/requests"
REMOTE_PREVIEW_IDENTITY_KEYS=''; PASTED_VALUE=''
if resolve_preview_identity_secret KEY_VAULTS_SECRET resolved 2>/dev/null; then exit 1; fi
[[ ! -e "$tmp/generations" ]]
REMOTE_GITHUB_IDENTITY_KEYS=''
resolve_preview_identity_secret AUTH_SECRET resolved
[[ "$resolved" == new-fixture-secret ]]
publish_preview_identity_secret AUTH_SECRET "$resolved"
grep -q 'upsert=false' "$tmp/requests"
! grep -q 'upsert=true' "$tmp/requests"
FAIL_INVENTORY=1
if load_preview_identity_inventory; then exit 1; fi
echo 'Preview identity secret preservation regressions passed'
