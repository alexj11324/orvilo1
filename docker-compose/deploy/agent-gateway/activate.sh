#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ "$EUID" -eq 0 ]] || { echo 'Run on the origin with sudo.' >&2; exit 1; }
compose_dir=/var/lib/orvilo1/docker-compose/deploy
service_dir=/var/lib/orvilo1/agent-gateway
override="$compose_dir/orvilo1-production.override.yml"
snapshot="$service_dir/rollback"
compose() {
  docker compose --profile hatchet -f "$compose_dir/docker-compose.yml" -f "$override" -f "$snapshot/pinned-images.yml" "$@"
}
if [[ "${1:-}" == rollback ]]; then
  cp -a "$snapshot/override.before.yml" "$override"
  compose up -d --no-deps --no-build --pull never --force-recreate orvilo hatchet-worker
  systemctl disable --now orvilo-agent-gateway.service
  rm -f /etc/nginx/sites-enabled/orvilo-agent-gateway
  nginx -t && systemctl reload nginx
  exit
fi
[[ ! -e "$snapshot" ]] || { echo 'Existing rollback snapshot; refusing to overwrite.' >&2; exit 1; }
[[ "$(curl -fsS http://127.0.0.1:28787/health)" == OK ]]
install -d -m 700 "$snapshot"
cp -a "$override" "$snapshot/override.before.yml"
curl -fsS http://127.0.0.1:3210/api/version > "$snapshot/version.before.json"
python3 - "$snapshot" "$override" <<'CHECK'
import json, pathlib, subprocess, sys
snapshot, override = map(pathlib.Path, sys.argv[1:])
images = {}
for service, container in [('orvilo', 'orvilo'), ('hatchet-worker', 'orvilo-hatchet-worker')]:
    data = json.loads(subprocess.check_output(['docker','inspect',container]))[0]
    assert data['State']['Running']
    images[service] = data['Image']
(snapshot / 'images.before.json').write_text(json.dumps(images))
(snapshot / 'pinned-images.yml').write_text('services:\n' + ''.join(f'  {name}:\n    image: {image}\n' for name,image in images.items()))
text = override.read_text()
assert '/run/orvilo-agent-gateway/app.env' not in text
marker = '    - /run/orvilo-device-gateway/app.env\n'
assert text.count(marker) == 2, 'Expected app and worker Device Gateway env-file entries'
override.write_text(text.replace(marker, marker + '    - /run/orvilo-agent-gateway/app.env\n'))
CHECK
rollback_on_failure() {
  local result=$?
  trap - EXIT
  if [[ "$result" != 0 ]]; then
    cp -a "$snapshot/override.before.yml" "$override"
    compose up -d --no-deps --no-build --pull never --force-recreate orvilo hatchet-worker || echo 'Automatic rollback failed; inspect snapshot.' >&2
  fi
  exit "$result"
}
trap rollback_on_failure EXIT
# Inspect the final Compose shape without exposing expanded credential values.
compose config --format json | python3 -c 'import json,sys; x=json.load(sys.stdin); assert all(x["services"][s]["environment"]["AGENT_GATEWAY_URL"]=="https://agent-gateway.aspectlylabs.com" for s in ["orvilo","hatchet-worker"])'
docker stop orvilo-hatchet-worker >/dev/null
compose up -d --no-deps --no-build --pull never --force-recreate orvilo
for attempt in $(seq 1 30); do
  if curl -fsS --max-time 3 http://127.0.0.1:3210/api/version > "$snapshot/version.after.json"; then break; fi
  [[ "$attempt" != 30 ]] || exit 1
  sleep 2
done
cmp "$snapshot/version.before.json" "$snapshot/version.after.json"
compose up -d --no-deps --no-build --pull never --force-recreate hatchet-worker
for attempt in $(seq 1 30); do
  if docker logs orvilo-hatchet-worker 2>&1 | grep -Ei 'worker .* listening for actions' >/dev/null; then break; fi
  [[ "$attempt" != 30 ]] || exit 1
  sleep 2
done
python3 - "$snapshot" <<'CHECK'
import hashlib,json,pathlib,subprocess,sys
snapshot=pathlib.Path(sys.argv[1]); images=json.loads((snapshot/'images.before.json').read_text())
token=next(line.split('=',1)[1] for line in pathlib.Path('/run/orvilo-agent-gateway/app.env').read_text().splitlines() if line.startswith('AGENT_GATEWAY_SERVICE_TOKEN='))
for service,container in [('orvilo','orvilo'),('hatchet-worker','orvilo-hatchet-worker')]:
    data=json.loads(subprocess.check_output(['docker','inspect',container]))[0]
    env=dict(entry.split('=',1) for entry in data['Config']['Env'])
    assert data['Image']==images[service] and data['State']['Running']
    assert env['AGENT_GATEWAY_SERVICE_TOKEN']==token
    assert env['AGENT_GATEWAY_URL']=='https://agent-gateway.aspectlylabs.com'
    assert env['DEVICE_GATEWAY_URL']=='https://device-gateway.aspectlylabs.com'
receipt={'source_sha':'fed50da75b8916566f87e32fafd852a8a34e336b','binary_sha256':hashlib.sha256(pathlib.Path('/var/lib/orvilo1/agent-gateway/agent-gateway').read_bytes()).hexdigest(),'image_id':subprocess.check_output(['docker','inspect','--format','{{.Image}}','orvilo-agent-gateway'],text=True).strip(),'original_app_images':images,'credentials_match':True,'rollback_snapshot':str(snapshot)}
(snapshot/'activation-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt))
CHECK
trap - EXIT
