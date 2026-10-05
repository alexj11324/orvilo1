#!/usr/bin/env bash
set -euo pipefail
umask 077

[[ "${GITHUB_ACTIONS:-}" == true ]] || { echo 'Manage gateway DNS through GitHub Actions only.' >&2; exit 1; }
: "${CLOUDFLARE_API_TOKEN:?}" "${CLOUDFLARE_ZONE_ID:?}" "${CLOUDFLARE_ACCOUNT_ID:?}" "${SSH_HOST:?}"
mode="${1:?Expected preflight, publish, or rollback.}"
state_dir="${2:?Expected the CI DNS snapshot directory.}"
name=device-gateway.aspectlylabs.com
mkdir -p "$state_dir"
python3 - "$SSH_HOST" <<'PY'
import ipaddress, sys
ipaddress.IPv4Address(sys.argv[1])
PY
records() {
  cf dns records list --zone "$CLOUDFLARE_ZONE_ID" --name "$name"
}
if [[ "$mode" == preflight ]]; then
  records > "$state_dir/before.json"
  jq -e --arg name "$name" 'type == "array" and length <= 1 and all(.[]; .name == $name and .type == "A")' "$state_dir/before.json" > /dev/null
  exit
fi
[[ -f "$state_dir/before.json" ]] || { echo 'The DNS snapshot is required.' >&2; exit 1; }
if [[ "$mode" == publish ]]; then
  body="$(jq -n --arg name "$name" --arg ip "$SSH_HOST" '{type: "A", name: $name, content: $ip, proxied: true, ttl: 1}')"
  if [[ "$(jq length "$state_dir/before.json")" == 0 ]]; then
    cf dns records create --zone "$CLOUDFLARE_ZONE_ID" --body "$body" > "$state_dir/applied.json"
  else
    record_id="$(jq -r '.[0].id' "$state_dir/before.json")"
    cf dns records edit "$record_id" --zone "$CLOUDFLARE_ZONE_ID" --body "$body" > "$state_dir/applied.json"
  fi
  records > "$state_dir/after.json"
  jq -e --arg name "$name" --arg ip "$SSH_HOST" 'length == 1 and .[0].name == $name and .[0].type == "A" and .[0].content == $ip and .[0].proxied == true' "$state_dir/after.json" > /dev/null
  echo 'Verified the gateway DNS record.'
  exit
fi
[[ "$mode" == rollback ]] || exit 1
if [[ "$(jq length "$state_dir/before.json")" == 1 ]]; then
  record_id="$(jq -r '.[0].id' "$state_dir/before.json")"
  body="$(jq -c '.[0] | {type, name, content, ttl, proxied, comment, tags, settings} | with_entries(select(.value != null))' "$state_dir/before.json")"
  cf dns records edit "$record_id" --zone "$CLOUDFLARE_ZONE_ID" --body "$body" > /dev/null
else
  records > "$state_dir/current.json"
  # A failed create can have reached Cloudflare before the CLI reported failure.
  # Remove only this deployment's exact A record; never another type or origin.
  jq -e --arg name "$name" --arg ip "$SSH_HOST" 'length <= 1 and all(.[]; .name == $name and .type == "A" and .content == $ip)' "$state_dir/current.json" > /dev/null
  if [[ "$(jq length "$state_dir/current.json")" == 1 ]]; then
    record_id="$(jq -r '.[0].id' "$state_dir/current.json")"
    cf dns records delete "$record_id" --zone "$CLOUDFLARE_ZONE_ID" --force > /dev/null
  fi
fi
echo 'Restored the gateway DNS snapshot.'
