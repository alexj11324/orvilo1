#!/usr/bin/env bash
set -euo pipefail
umask 077
mode="${1:?}" directory="${2:?}" candidate="${3:?}" harness="${4:?}" image="${5:?}"
[[ "$directory" == /var/lib/orvilo1-qa-permission-20261008 && "$candidate" == 56eb1e0b3e1d1d39af4c64ce84d717b7599e9c71 ]]
[[ "$harness" =~ ^[a-f0-9]{40}$ && "$harness" != "$candidate" ]]
[[ "$image" =~ ^ghcr.io/alexj11324/orvilo1@sha256:[a-f0-9]{64}$ ]]
[[ "$mode" == dry-run || "$mode" == activate ]]
if [[ "$mode" == dry-run ]]; then echo 'QA admission passed; no host operations'; exit; fi
[[ "$EUID" == 0 && "$(uname -s)" == Linux && "$(uname -m)" == aarch64 ]]
runtime=/run/orvilo-qa-permission
bundle="$directory/bundle"
nginx_path=/etc/nginx/sites-available/orvilo-qa-permission
names=(app worker collaboration agent-gateway device-gateway postgres redis storage storage-init mailpit hatchet-postgres hatchet)
volumes=(qa-postgres qa-redis qa-storage qa-mailpit qa-hatchet-postgres qa-hatchet-config)
[[ ! -e "$directory/activation-receipt.json" && ! -e "$nginx_path" && ! -e /etc/nginx/sites-enabled/orvilo-qa-permission ]]
[[ "$(stat -c '%u:%a' "$runtime")" == '0:700' ]]
for file in compose.env app.env agent-gateway.env device-gateway.env collaboration.env; do
  [[ "$(stat -c '%u:%a' "$runtime/$file")" == '0:600' ]]
done
for name in "${names[@]}"; do
  if docker container inspect "orvilo-qa-permission-$name" >/dev/null 2>&1; then echo 'QA name already exists' >&2; exit 1; fi
done
for name in "${volumes[@]}"; do
  if docker volume inspect "orvilo-qa-permission-20261008_$name" >/dev/null 2>&1; then echo 'QA volume already exists' >&2; exit 1; fi
done
if docker network inspect orvilo-qa-permission-20261008 >/dev/null 2>&1; then echo 'QA network already exists' >&2; exit 1; fi
[[ -z "$(ss -H -ltn | awk '$4 ~ /:(13210|13212|13250|13251|13287|13288)$/')" ]]
if grep -RqsE 'server_name[^;]*\bqa-permission\.aspectlylabs\.com\b' /etc/nginx/sites-enabled; then exit 1; fi
cd "$bundle"
sha256sum -c SHA256SUMS
python3 - "$candidate" "$harness" "$image" <<'PY'
import json, sys
receipt = json.load(open('admission.json'))
assert [receipt['candidateSha'], receipt['workflowSha'], receipt['image'], receipt['target']] == [*sys.argv[1:], 'qa-permission-20261008']
PY
compose() { docker compose --env-file "$runtime/compose.env" -f "$bundle/docker-compose.yml" "$@"; }
started=false nginx_installed=false
cleanup() {
  local status=$?
  trap - EXIT
  rm -f -- "$runtime"/*.env "$runtime/hatchet-token"
  if [[ "$status" != 0 && "$started" == true ]]; then
    for name in "${names[@]}"; do docker rm -f "orvilo-qa-permission-$name" >/dev/null 2>&1 || true; done
    for name in "${volumes[@]}"; do docker volume rm "orvilo-qa-permission-20261008_$name" >/dev/null 2>&1 || true; done
    docker network rm orvilo-qa-permission-20261008 >/dev/null 2>&1 || true
  fi
  if [[ "$status" != 0 && "$nginx_installed" == true ]]; then
    rm -f -- "$nginx_path" /etc/nginx/sites-enabled/orvilo-qa-permission
    nginx -t && systemctl reload nginx
  fi
  exit "$status"
}
trap cleanup EXIT
compose pull
started=true
compose up -d postgres redis storage storage-init mailpit hatchet-postgres hatchet
for attempt in $(seq 1 60); do
  if docker exec orvilo-qa-permission-hatchet bash -c 'exec 3<>/dev/tcp/127.0.0.1/7077' >/dev/null 2>&1; then break; fi
  [[ "$attempt" != 60 ]] || { echo 'QA Hatchet readiness failed' >&2; exit 1; }
  sleep 2
done
# Normal vendor bootstrap issues a new token in the fresh QA Hatchet tenant.
docker exec orvilo-qa-permission-hatchet /hatchet-admin token create --config /config --name qa-permission-20261008 --expiresIn 168h > "$runtime/hatchet-token"
python3 - "$runtime" <<'PY'
import base64, json, pathlib, re, sys
directory = pathlib.Path(sys.argv[1])
token = (directory / 'hatchet-token').read_text().strip()
assert re.fullmatch(r'[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', token), 'Invalid QA Hatchet token format'
payload = token.split('.')[1]
claims = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))
text = json.dumps(claims)
assert 'hatchet:7077' in text and 'http://hatchet:8888' in text, 'QA Hatchet token has foreign routing'
with (directory / 'app.env').open('a') as handle:
    handle.write(f'HATCHET_CLIENT_TOKEN={token}\n')
PY
compose up -d app collaboration agent-gateway device-gateway
for attempt in $(seq 1 60); do
  if docker logs orvilo-qa-permission-app 2>&1 | grep -q 'migration pass' && curl -fsS --max-time 3 http://127.0.0.1:13210/api/version >/dev/null; then break; fi
  [[ "$attempt" != 60 ]] || { echo 'QA migration/app readiness failed' >&2; exit 1; }
  sleep 3
done
compose up -d worker
for attempt in $(seq 1 60); do
  if docker logs orvilo-qa-permission-worker 2>&1 | grep -Eiq 'worker .* listening for actions'; then break; fi
  [[ "$attempt" != 60 ]] || { echo 'QA worker readiness failed' >&2; exit 1; }
  sleep 2
done
curl -fsS --max-time 5 http://127.0.0.1:13212/health >/dev/null
[[ "$(curl -fsS --max-time 5 http://127.0.0.1:13288/health)" == OK ]]
curl -fsS --max-time 5 http://127.0.0.1:13287/health >/dev/null
install -m 644 nginx.conf "$nginx_path"
ln -s "$nginx_path" /etc/nginx/sites-enabled/orvilo-qa-permission
nginx_installed=true
nginx -t
systemctl reload nginx
docker inspect --format '{{.Config.Image}}' orvilo-qa-permission-app | grep -Fx "$image" >/dev/null
cp admission.json "$directory/activation-receipt.json"
echo 'QA services and fresh schema are ready; normal auth and product acceptance are still pending'
