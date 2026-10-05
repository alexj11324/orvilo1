#!/usr/bin/env bash
set -euo pipefail
umask 077
# The canonical credential stays in GSM; only tmpfs copies exist on the host.
: "${GSM_PROJECT_ID:?Configure the deployment Secret Manager project.}"
: "${GSM_SECRET_ID:?Configure the Agent Gateway secret reference.}"
: "${GSM_READER_USER:?Configure the authorized host user.}"
service_token="$(runuser -u "$GSM_READER_USER" -- gcloud secrets versions access latest --secret="$GSM_SECRET_ID" --project="$GSM_PROJECT_ID")"
[[ "$service_token" =~ ^[a-f0-9]{64}$ ]] || { echo 'Invalid Agent Gateway credential.' >&2; exit 1; }
printf 'AGENT_GATEWAY_URL=https://agent-gateway.aspectlylabs.com\nAGENT_GATEWAY_SERVICE_TOKEN=%s\nENABLE_AGENT_GATEWAY=1\n' "$service_token" > /run/orvilo-agent-gateway/app.env
printf 'SERVICE_TOKEN=%s\nJWKS_PUBLIC_KEY=%s\nLOBE_API_BASE_URL=https://orvilo.aspectlylabs.com\n' "$service_token" "$(cat /etc/orvilo-agent-gateway/jwks.public.json)" > /run/orvilo-agent-gateway/gateway.env
exec docker run --rm --name orvilo-agent-gateway --publish 127.0.0.1:28787:8787 --env-file /run/orvilo-agent-gateway/gateway.env orvilo-agent-gateway:fed50da75b89-origin-v1
