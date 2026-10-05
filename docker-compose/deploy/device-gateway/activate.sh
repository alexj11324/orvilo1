#!/usr/bin/env bash
set -euo pipefail
umask 077

[[ "$EUID" -eq 0 && "$(uname -s)" == Linux && "$(uname -m)" == aarch64 ]] || { echo 'Activation requires root on the ARM64 Linux origin.' >&2; exit 1; }
mode="${1:?Expected activate or rollback.}"
commit="${2:?Expected CI commit.}"
run_id="${3:?Expected CI run ID.}"
run_attempt="${4:?Expected CI run attempt.}"
[[ "$commit" =~ ^[a-f0-9]{40}$ && "$run_id" =~ ^[0-9]+$ && "$run_attempt" =~ ^[0-9]+$ ]] || exit 1
bundle_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
compose_dir=/var/lib/orvilo1/docker-compose/deploy
override="$compose_dir/orvilo1-production.override.yml"
service_dir=/var/lib/orvilo1/device-gateway
snapshot="$service_dir/rollback/$commit-$run_id-$run_attempt"
service=orvilo-device-gateway.service
paths=(/usr/local/bin/orvilo-device-gateway "$service_dir/start.sh" "$service_dir/build-receipt.json" /etc/systemd/system/orvilo-device-gateway.service /etc/nginx/sites-available/orvilo-device-gateway /etc/nginx/sites-enabled/orvilo-device-gateway /etc/orvilo-device-gateway/jwks.public.json)
cd "$bundle_dir"
sha256sum -c SHA256SUMS
python3 - "$bundle_dir/build-receipt.json" "$commit" "$run_id" "$run_attempt" <<'PY'
import json, sys
receipt = json.load(open(sys.argv[1]))
assert [receipt['commit_sha'], receipt['run_id'], receipt['run_attempt']] == sys.argv[2:]
assert receipt['source_sha'] == 'fed50da75b8916566f87e32fafd852a8a34e336b'
assert receipt['go_version'] == 'go1.26.8' and receipt['target'] == 'linux/arm64'
PY

compose() {
  docker compose --profile hatchet -f "$compose_dir/docker-compose.yml" -f "$override" -f "$snapshot/pinned-images.yml" "$@"
}
rollback_host() {
  local failed=0 path
  [[ -f "$snapshot/override.before.yml" && -f "$snapshot/pinned-images.yml" ]] || return 1
  if systemctl cat "$service" >/dev/null 2>&1; then systemctl stop "$service" || failed=1; fi
  for path in "${paths[@]}"; do
    rm -f -- "$path" || failed=1
    if [[ -e "$snapshot/original$path" || -L "$snapshot/original$path" ]]; then
      cp -a -- "$snapshot/original$path" "$path" || failed=1
    fi
  done
  cp -a "$snapshot/override.before.yml" "$override" || failed=1
  systemctl daemon-reload || failed=1
  if [[ -f /etc/systemd/system/orvilo-device-gateway.service ]]; then
    if [[ "$(cat "$snapshot/service-enabled")" == yes ]]; then
      systemctl enable "$service" || failed=1
    else
      systemctl disable "$service" || failed=1
    fi
    if [[ "$(cat "$snapshot/service-active")" == yes ]]; then
      systemctl start "$service" || failed=1
    fi
  fi
  compose up -d --no-deps --no-build --pull never --force-recreate orvilo hatchet-worker || failed=1
  nginx -t && systemctl reload nginx || failed=1
  printf 'Rollback snapshot: %s\n' "$snapshot"
  return "$failed"
}
if [[ "$mode" == rollback ]]; then
  rollback_host
  exit
fi
[[ "$mode" == activate && -f "$override" ]] || { echo 'The existing production override is required.' >&2; exit 1; }
python3 -c 'import yaml'
[[ "$(stat -c '%u:%a' /etc/orvilo-device-gateway/service-token)" == '0:400' ]] || { echo 'The host bootstrap credential must be root-owned mode 0400.' >&2; exit 1; }
python3 - <<'PY'
import pathlib, re
assert re.fullmatch(r'[a-f0-9]{64}\n?', pathlib.Path('/etc/orvilo-device-gateway/service-token').read_text())
PY
[[ ! -e "$snapshot" ]] || { echo 'This CI activation already has a snapshot; refusing to overwrite it.' >&2; exit 1; }
install -d -m 700 "$snapshot/original"
cp -a "$override" "$snapshot/override.before.yml"
for path in "${paths[@]}"; do
  if [[ -e "$path" || -L "$path" ]]; then cp -a --parents "$path" "$snapshot/original/"; fi
done
if systemctl is-active --quiet "$service"; then echo yes; else echo no; fi > "$snapshot/service-active"
if systemctl is-enabled --quiet "$service"; then echo yes; else echo no; fi > "$snapshot/service-enabled"
curl -fsS --max-time 20 http://127.0.0.1:3210/api/version > "$snapshot/app-version.before.json"
python3 - "$snapshot" <<'PY'
import json, pathlib, subprocess, sys, yaml
snapshot = pathlib.Path(sys.argv[1])
images = {}
for service, container in [('orvilo', 'orvilo'), ('hatchet-worker', 'orvilo-hatchet-worker')]:
    data = json.loads(subprocess.check_output(['docker', 'inspect', container]))[0]
    assert data['State']['Running'], f'{container} must be running before activation'
    images[service] = data['Image']
(snapshot / 'images.before.json').write_text(json.dumps(images, indent=2) + '\n')
(snapshot / 'pinned-images.yml').write_text(yaml.safe_dump({'services': {name: {'image': image} for name, image in images.items()}}))
PY
# Export through the running app; no private key or host .env is copied.
docker exec orvilo node -e '
try {
  const { createPublicKey } = require("node:crypto");
  const key = JSON.parse(process.env.JWKS_KEY).keys.find(k => k.kty === "RSA" && k.alg === "RS256");
  if (!key) throw new Error();
  const publicKey = createPublicKey({ key, format: "jwk" }).export({ format: "jwk" });
  process.stdout.write(JSON.stringify({ keys: [{ ...publicKey, alg: "RS256", use: "sig", kid: key.kid }] }) + "\n");
} catch { console.error("Public JWKS export failed"); process.exit(1); }
' > "$snapshot/jwks.public.json"
rollback_on_exit() {
  local deployment_status=$?
  trap - EXIT
  if [[ "$deployment_status" != 0 ]] && ! rollback_host; then
    echo 'Rollback failed; inspect the recorded host snapshot.' >&2
  fi
  exit "$deployment_status"
}
trap rollback_on_exit EXIT
install -d -m 755 "$service_dir" /etc/orvilo-device-gateway
install -m 755 "$bundle_dir/device-gateway" /usr/local/bin/orvilo-device-gateway
install -m 755 "$bundle_dir/start.sh" "$service_dir/start.sh"
install -m 644 "$bundle_dir/build-receipt.json" "$service_dir/build-receipt.json"
install -m 644 "$snapshot/jwks.public.json" /etc/orvilo-device-gateway/jwks.public.json
install -m 644 "$bundle_dir/orvilo-device-gateway.service" /etc/systemd/system/orvilo-device-gateway.service
install -m 644 "$bundle_dir/nginx.conf" /etc/nginx/sites-available/orvilo-device-gateway
ln -sfn /etc/nginx/sites-available/orvilo-device-gateway /etc/nginx/sites-enabled/orvilo-device-gateway
nginx -t
systemctl daemon-reload
systemctl enable "$service"
systemctl restart "$service"
for attempt in $(seq 1 30); do
  if [[ "$(curl -fsS --max-time 3 http://127.0.0.1:28788/health || true)" == OK ]]; then break; fi
  [[ "$attempt" != 30 ]] || { echo 'Gateway health failed.' >&2; exit 1; }
  sleep 2
done
[[ "$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:28788/api/device/devices)" == 401 ]]
python3 "$bundle_dir/update-override.py" "$override"
# Only the original app/worker image IDs may be recreated. No build or pull.
docker stop orvilo-hatchet-worker > /dev/null
compose up -d --no-deps --no-build --pull never --force-recreate orvilo
for attempt in $(seq 1 30); do
  if curl -fsS --max-time 3 http://127.0.0.1:3210/api/version > "$snapshot/app-version.after.json"; then break; fi
  [[ "$attempt" != 30 ]] || { echo 'App version health failed.' >&2; exit 1; }
  sleep 2
done
cmp "$snapshot/app-version.before.json" "$snapshot/app-version.after.json"
compose up -d --no-deps --no-build --pull never --force-recreate hatchet-worker
for attempt in $(seq 1 30); do
  if docker logs orvilo-hatchet-worker 2>&1 | grep -Ei 'worker .* listening for actions' > /dev/null; then break; fi
  [[ "$attempt" != 30 ]] || { echo 'Worker readiness failed.' >&2; exit 1; }
  sleep 2
done
systemctl reload nginx
python3 - "$snapshot" "$bundle_dir" <<'PY'
import hashlib, json, pathlib, subprocess, sys
snapshot, bundle = map(pathlib.Path, sys.argv[1:])
images = json.loads((snapshot / 'images.before.json').read_text())
token = pathlib.Path('/etc/orvilo-device-gateway/service-token').read_text().strip()
for service, container in [('orvilo', 'orvilo'), ('hatchet-worker', 'orvilo-hatchet-worker')]:
    data = json.loads(subprocess.check_output(['docker', 'inspect', container]))[0]
    assert data['Image'] == images[service] and data['State']['Running'], f'{container} image/running check failed'
    env = dict(entry.split('=', 1) for entry in data['Config']['Env'])
    assert env.get('DEVICE_GATEWAY_URL') == 'https://device-gateway.aspectlylabs.com', f'{container} gateway URL check failed'
    assert env.get('DEVICE_GATEWAY_SERVICE_TOKEN') == token, f'{container} gateway credential check failed'
pid = subprocess.check_output(['systemctl', 'show', '--property=MainPID', '--value', 'orvilo-device-gateway.service'], text=True).strip()
binary_sha = hashlib.sha256(pathlib.Path(f'/proc/{pid}/exe').read_bytes()).hexdigest()
receipt = json.loads((bundle / 'build-receipt.json').read_text())
assert binary_sha == receipt['binary_sha256'], 'Running gateway differs from CI artifact'
receipt.update({'original_images': images, 'running_binary_sha256': binary_sha, 'container_credentials_match': True, 'rollback_snapshot': str(snapshot)})
(snapshot / 'activation-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
PY
trap - EXIT
printf 'Verified CI activation; rollback snapshot: %s\n' "$snapshot"
