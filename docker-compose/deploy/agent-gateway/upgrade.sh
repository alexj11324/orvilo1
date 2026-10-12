#!/usr/bin/env bash
set -euo pipefail
umask 077

# Replaces the running Agent Gateway image with the one in this CI bundle, or
# returns to the image and launcher recorded by an earlier upgrade. The first
# activation (unit, nginx, app settings) is activate.sh's job, not this script's.
[[ "$EUID" -eq 0 && "$(uname -s)" == Linux && "$(uname -m)" == aarch64 ]] || { echo 'Upgrade requires root on the ARM64 Linux origin.' >&2; exit 1; }
mode="${1:?Expected activate or rollback.}"
commit="${2:?Expected CI commit.}"
run_id="${3:?Expected CI run ID.}"
run_attempt="${4:?Expected CI run attempt.}"
[[ "$commit" =~ ^[a-f0-9]{40}$ && "$run_id" =~ ^[0-9]+$ && "$run_attempt" =~ ^[0-9]+$ ]] || exit 1
bundle_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
# Overridden only by test-upgrade.sh.
service_dir="${AGENT_GATEWAY_SERVICE_DIR:-/var/lib/orvilo1/agent-gateway}"
snapshot="$service_dir/upgrades/$commit-$run_id-$run_attempt"
service=orvilo-agent-gateway.service
container=orvilo-agent-gateway
origin=http://127.0.0.1:28787

wait_healthy() {
  # The launcher reads its credential from Secret Manager before the container starts.
  for _ in $(seq 1 45); do
    if [[ "$(curl -fsS --max-time 3 "$origin/health" || true)" == OK ]]; then return 0; fi
    sleep 2
  done
  echo 'Agent Gateway health failed.' >&2
  return 1
}
restore() {
  [[ -f "$snapshot/start.sh" && -s "$snapshot/image-id" && -s "$snapshot/image-tag" ]] || { echo 'No snapshot for this CI run.' >&2; return 1; }
  # A rebuild of the same source reuses its tag, so point the tag back at the recorded image.
  docker tag "$(cat "$snapshot/image-id")" "$(cat "$snapshot/image-tag")"
  install -m 755 "$snapshot/start.sh" "$service_dir/start.sh"
  systemctl restart "$service"
  wait_healthy
  printf 'Restored the Agent Gateway from %s\n' "$snapshot"
}
if [[ "$mode" == rollback ]]; then
  restore
  exit
fi
[[ "$mode" == activate ]] || { echo 'Expected activate or rollback.' >&2; exit 1; }

cd "$bundle_dir"
sha256sum -c SHA256SUMS
read -r image_tag image_id < <(python3 - "$bundle_dir/build-receipt.json" "$commit" "$run_id" "$run_attempt" <<'PY'
import json, re, sys
receipt = json.load(open(sys.argv[1]))
assert [receipt['commit_sha'], receipt['run_id'], receipt['run_attempt']] == sys.argv[2:]
assert receipt['go_version'] == 'go1.26.8' and receipt['target'] == 'linux/arm64'
assert receipt['image_tag'] == 'orvilo-agent-gateway:' + receipt['source_sha'][:12]
assert re.fullmatch(r'sha256:[a-f0-9]{64}', receipt['image_id'])
print(receipt['image_tag'], receipt['image_id'])
PY
)
grep -q -- " $image_tag\$" "$bundle_dir/start.sh" || { echo 'The bundled launcher does not run the bundled image.' >&2; exit 1; }
[[ ! -e "$snapshot" ]] || { echo 'This CI run already has a snapshot; refusing to overwrite it.' >&2; exit 1; }
[[ -f "$service_dir/start.sh" ]] || { echo 'The Agent Gateway is not installed; run the first activation.' >&2; exit 1; }
[[ "$(curl -fsS --max-time 5 "$origin/health")" == OK ]] || { echo 'The running Agent Gateway is unhealthy; not upgrading over it.' >&2; exit 1; }
previous_tag="$(grep -o 'orvilo-agent-gateway:[A-Za-z0-9._-]*' "$service_dir/start.sh" | tail -n 1)"
[[ -n "$previous_tag" ]] || { echo 'The installed launcher names no image.' >&2; exit 1; }
install -d -m 700 "$snapshot"
cp -a "$service_dir/start.sh" "$snapshot/start.sh"
docker inspect --format '{{.Image}}' "$container" > "$snapshot/image-id"
printf '%s\n' "$previous_tag" > "$snapshot/image-tag"

# Nothing that is running has changed yet, so a bad image needs no restart.
gunzip -c "$bundle_dir/image.tar.gz" | docker load
if [[ "$(docker image inspect --format '{{.Id}}' "$image_tag")" != "$image_id" ]]; then
  docker tag "$(cat "$snapshot/image-id")" "$previous_tag"
  echo 'Loaded image differs from the CI receipt.' >&2
  exit 1
fi
restore_on_exit() {
  local status=$?
  trap - EXIT
  if [[ "$status" != 0 ]] && ! restore; then
    echo 'Restore failed; inspect the recorded snapshot.' >&2
  fi
  exit "$status"
}
trap restore_on_exit EXIT
install -m 755 "$bundle_dir/start.sh" "$service_dir/start.sh"
systemctl restart "$service"
wait_healthy
[[ "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 -X POST "$origin/api/operations/upgrade-check/events")" == 401 ]] || { echo 'Unauthenticated publication was not rejected.' >&2; exit 1; }
[[ "$(docker inspect --format '{{.Image}}' "$container")" == "$image_id" ]] || { echo 'The running container is not the CI image.' >&2; exit 1; }
python3 - "$bundle_dir/build-receipt.json" "$snapshot" <<'PY'
import json, pathlib, sys
receipt = json.load(open(sys.argv[1]))
snapshot = pathlib.Path(sys.argv[2])
receipt.update({
    'running_image_id': receipt['image_id'],
    'previous_image_id': (snapshot / 'image-id').read_text().strip(),
    'previous_image_tag': (snapshot / 'image-tag').read_text().strip(),
    'rollback_snapshot': str(snapshot),
})
(snapshot / 'activation-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
PY
install -m 644 "$bundle_dir/build-receipt.json" "$service_dir/build-receipt.json"
trap - EXIT
printf 'Verified CI upgrade; rollback snapshot: %s\n' "$snapshot"
