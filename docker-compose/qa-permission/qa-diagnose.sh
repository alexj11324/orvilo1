#!/usr/bin/env bash
set -euo pipefail
[[ "${GITHUB_ACTIONS:-}" == true && "${GITHUB_REF:-}" == refs/heads/codex/permission-qa-harness ]]
: "${SSH_HOST:?}"
python3 - "$SSH_HOST" <<'PY'
import ipaddress, sys
ipaddress.IPv4Address(sys.argv[1])
PY
ssh -i ~/.ssh/deploy_key -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=15 "ubuntu@$SSH_HOST" 'sudo bash -s' <<'QA_DIAGNOSTICS'
set -uo pipefail
uptime
free -m
for resource in cpu memory io; do cat "/proc/pressure/$resource"; done
names=(orvilo orvilo-qa-permission-app orvilo-qa-permission-worker orvilo-qa-permission-collaboration orvilo-qa-permission-agent-gateway orvilo-qa-permission-device-gateway orvilo-qa-permission-postgres orvilo-qa-permission-redis orvilo-qa-permission-storage orvilo-qa-permission-storage-init orvilo-qa-permission-mailpit orvilo-qa-permission-hatchet-postgres orvilo-qa-permission-hatchet)
for name in "${names[@]}"; do
  docker inspect --format '{{.Name}} image={{.Image}} state={{.State.Status}} oom={{.State.OOMKilled}} exit={{.State.ExitCode}} project={{index .Config.Labels "com.docker.compose.project"}} service={{index .Config.Labels "com.docker.compose.service"}}' "$name" || true
done
timeout 15 docker stats --no-stream --format '{{.Name}} cpu={{.CPUPerc}} memory={{.MemUsage}}' "${names[@]}" || true
for url in http://127.0.0.1:3210/api/version http://127.0.0.1:13210/api/version http://127.0.0.1:13212/health http://127.0.0.1:13287/health http://127.0.0.1:13288/health; do
  printf '%s\n' "$url"
  curl -fsS --max-time 5 "$url" || true
  printf '\n'
done
nginx -t
grep -E 'listen |server_name |location |proxy_pass ' /etc/nginx/sites-available/orvilo-qa-permission || true
stat -c '%n %U %a %s' /var/lib/orvilo1-qa-permission-20261008 /var/lib/orvilo1-qa-permission-20261008/activation-receipt.json /run/orvilo-qa-permission || true
for file in owner.id compose.env app.env agent-gateway.env device-gateway.env collaboration.env hatchet-token; do
  stat -c '%n %U %a %s' "/run/orvilo-qa-permission/$file" || true
done
if [[ -f /run/orvilo-qa-permission/owner.id ]]; then
  owner="$(cat /run/orvilo-qa-permission/owner.id)"
  if [[ "$owner" =~ ^[0-9]+-[0-9]+$ ]]; then printf 'owner=%s\n' "$owner"; else echo 'invalid owner marker'; fi
fi
docker network inspect --format '{{.Name}} {{range .Containers}}{{.Name}} {{end}}' orvilo-qa-permission-20261008 || true
docker volume ls --filter name=orvilo-qa-permission-20261008_ --format '{{.Name}}'
QA_DIAGNOSTICS
