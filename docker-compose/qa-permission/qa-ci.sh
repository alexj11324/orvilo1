#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ "${GITHUB_ACTIONS:-}" == true && "${GITHUB_REF:-}" == refs/heads/codex/permission-qa-current ]]
[[ "${QA_BUILD_RUN_ID:-}" =~ ^[0-9]+$ ]]
[[ "${QA_GATEWAY_IMAGE_REF:-}" =~ ^ghcr.io/alexj11324/orvilo1@sha256:[a-f0-9]{64}$ ]]
: "${RUNNER_TEMP:?}" "${SSH_HOST:?}" "${CLERK_SECRET_KEY:?}" "${CLOUDFLARE_DNS_API_TOKEN:?}" "${CLOUDFLARE_API_TOKEN:?}" "${CLOUDFLARE_ZONE_ID:?}"
[[ "${CLOUDFLARE_ACCOUNT_ID:-}" == d8f6630c7869111a5139bc5ed4d24ace ]]
python3 - "$SSH_HOST" <<'PY'
import ipaddress, sys
ipaddress.IPv4Address(sys.argv[1])
PY
candidate=56eb1e0b3e1d1d39af4c64ce84d717b7599e9c71
state="$RUNNER_TEMP/qa-permission-state"
secret_dir="$RUNNER_TEMP/qa-env-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
bundle="$RUNNER_TEMP/qa-permission-bundle"
mkdir -m 700 "$state" "$bundle"
host_runtime_created=false
cleanup() {
  local status=$?
  trap - EXIT
  rm -rf -- "$secret_dir"
  rm -f -- "$state/build.log"
  if [[ "$host_runtime_created" == true ]]; then
    ssh -i ~/.ssh/deploy_key -o BatchMode=yes -o StrictHostKeyChecking=yes "ubuntu@$SSH_HOST" \
      "if test \"\$(sudo cat /run/orvilo-qa-permission/owner.id 2>/dev/null)\" = '$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT'; then sudo rm -f /run/orvilo-qa-permission/compose.env /run/orvilo-qa-permission/app.env /run/orvilo-qa-permission/agent-gateway.env /run/orvilo-qa-permission/device-gateway.env /run/orvilo-qa-permission/collaboration.env /run/orvilo-qa-permission/hatchet-token; fi" || status=1
  fi
  exit "$status"
}
trap cleanup EXIT
# Bind the registry tag to the successful exact-candidate CI build receipt.
gh api "repos/$GITHUB_REPOSITORY/actions/runs/$QA_BUILD_RUN_ID" > "$state/build-run.json"
jq -e --arg sha "$candidate" '.head_sha == $sha and .event == "workflow_dispatch" and .path == ".github/workflows/deploy-orvilo1.yml" and .status == "completed" and .conclusion == "success"' "$state/build-run.json" >/dev/null
gh api "repos/$GITHUB_REPOSITORY/actions/runs/$QA_BUILD_RUN_ID/jobs?per_page=100" > "$state/build-jobs.json"
job="$(jq -er '[.jobs[] | select(.name == "build" and .conclusion == "success")] | if length == 1 then .[0].id else error("Expected one successful candidate build") end' "$state/build-jobs.json")"
gh run view --repo "$GITHUB_REPOSITORY" --job "$job" --log > "$state/build.log"
build_digest="$(awk '/DIGEST: sha256:/ {print $NF}' "$state/build.log" | sort -u)"
[[ "$build_digest" =~ ^sha256:[a-f0-9]{64}$ ]]
registry_digest="sha256:$(docker buildx imagetools inspect "ghcr.io/alexj11324/orvilo1:sha-$candidate" --raw | sha256sum | cut -d' ' -f1)"
[[ "$build_digest" == "$registry_digest" ]]
export QA_IMAGE_REF="ghcr.io/alexj11324/orvilo1@$registry_digest" QA_CANDIDATE_SHA="$candidate"
node docker-compose/qa-permission/admit.mjs > "$bundle/admission.json"
rm -f -- "$state/build.log"
# The QA names must be unused; never edit an existing record or production Worker.
CLOUDFLARE_API_TOKEN="$CLOUDFLARE_DNS_API_TOKEN" cf zones get --zone "$CLOUDFLARE_ZONE_ID" > "$state/zone.json"
jq -e --arg account "$CLOUDFLARE_ACCOUNT_ID" '.name == "aspectlylabs.com" and .account.id == $account and .status == "active"' "$state/zone.json" >/dev/null
for name in qa-permission.aspectlylabs.com accounts-qa-permission.aspectlylabs.com; do
  CLOUDFLARE_API_TOKEN="$CLOUDFLARE_DNS_API_TOKEN" cf dns records list --zone "$CLOUDFLARE_ZONE_ID" --name "$name" > "$state/$name.json"
  jq -e 'type == "array" and length == 0' "$state/$name.json" >/dev/null
done
cf workers scripts search --name orvilo-auth-qa-permission > "$state/workers.json"
jq -e 'type == "array" and all(.[]; .id != "orvilo-auth-qa-permission" and .name != "orvilo-auth-qa-permission")' "$state/workers.json" >/dev/null
ssh -i ~/.ssh/deploy_key -o BatchMode=yes -o StrictHostKeyChecking=yes "ubuntu@$SSH_HOST" \
  'test ! -e /var/lib/orvilo1-qa-permission-20261008 && test ! -e /run/orvilo-qa-permission && test ! -e /etc/nginx/sites-available/orvilo-qa-permission && test ! -e /etc/nginx/sites-enabled/orvilo-qa-permission'
node docker-compose/qa-permission/prepare-env.mjs "$secret_dir"
printf '%s\n' "$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT" > "$secret_dir/owner.id"
cp docker-compose/qa-permission/{activate.sh,docker-compose.yml,nginx.conf} "$bundle/"
(cd "$bundle" && sha256sum activate.sh docker-compose.yml nginx.conf admission.json > SHA256SUMS)
tar -C "$bundle" -czf - . |
  ssh -i ~/.ssh/deploy_key -o BatchMode=yes -o StrictHostKeyChecking=yes "ubuntu@$SSH_HOST" \
    'sudo install -d -m 700 /var/lib/orvilo1-qa-permission-20261008/bundle && sudo tar --no-same-owner -xzf - -C /var/lib/orvilo1-qa-permission-20261008/bundle'
host_runtime_created=true
tar -C "$secret_dir" -czf - . |
  ssh -i ~/.ssh/deploy_key -o BatchMode=yes -o StrictHostKeyChecking=yes "ubuntu@$SSH_HOST" \
    'sudo install -d -m 700 /run/orvilo-qa-permission && sudo tar --no-same-owner -xzf - -C /run/orvilo-qa-permission'
ssh -i ~/.ssh/deploy_key -o BatchMode=yes -o StrictHostKeyChecking=yes "ubuntu@$SSH_HOST" \
  "sudo bash /var/lib/orvilo1-qa-permission-20261008/bundle/activate.sh activate /var/lib/orvilo1-qa-permission-20261008 '$candidate' '$GITHUB_SHA' '$QA_IMAGE_REF'"
body="$(jq -n --arg ip "$SSH_HOST" '{type:"A",name:"qa-permission.aspectlylabs.com",content:$ip,proxied:true,ttl:1,comment:"permission QA 20261008"}')"
CLOUDFLARE_API_TOKEN="$CLOUDFLARE_DNS_API_TOKEN" cf dns records create --zone "$CLOUDFLARE_ZONE_ID" --body "$body" > "$state/app-dns.json"
# Both auth source and QA-only config were built in this same harness CI run.
(cd apps/auth/cf && node_modules/.bin/cf deploy --prebuilt)
curl -fsS --max-time 20 https://qa-permission.aspectlylabs.com/api/version > "$state/version.json"
curl -fsS --retry 10 --retry-all-errors --retry-delay 3 --retry-max-time 60 --max-time 5 https://accounts-qa-permission.aspectlylabs.com/healthz >/dev/null
curl -fsS --max-time 20 https://qa-permission.aspectlylabs.com/_qa/device-gateway/health >/dev/null
ssh -i ~/.ssh/deploy_key -o BatchMode=yes -o StrictHostKeyChecking=yes "ubuntu@$SSH_HOST" \
  'sudo cat /var/lib/orvilo1-qa-permission-20261008/activation-receipt.json' > "$state/activation-receipt.json"
jq --arg build_run "$QA_BUILD_RUN_ID" --arg gateway_image "$QA_GATEWAY_IMAGE_REF" \
  '. + {candidate_build_run:$build_run,gateway_image:$gateway_image,normal_auth_acceptance:"pending"}' \
  "$state/activation-receipt.json" > "$RUNNER_TEMP/qa-permission-receipt.json"
echo 'QA deployment receipt emitted; product/auth acceptance still pending.'
