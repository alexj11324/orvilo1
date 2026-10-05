#!/usr/bin/env bash
set -euo pipefail
umask 077

# systemd loads the root-only bootstrap credential into its private runtime
# credential directory. The canonical copy is held in Secret Manager.
service_token="$(cat "$CREDENTIALS_DIRECTORY/service-token")"
[[ "$service_token" =~ ^[a-f0-9]{64}$ ]] || { echo 'Invalid device gateway service credential.' >&2; exit 1; }
JWKS_PUBLIC_KEY="$(cat /etc/orvilo-device-gateway/jwks.public.json)"
SERVICE_TOKEN="$service_token"
export JWKS_PUBLIC_KEY SERVICE_TOKEN

# Compose reads this tmpfs file when recreating the app or its worker. Existing
# plaintext .env credentials are not edited or copied into this directory.
printf 'DEVICE_GATEWAY_URL=https://device-gateway.aspectlylabs.com\nDEVICE_GATEWAY_SERVICE_TOKEN=%s\n' "$service_token" > /run/orvilo-device-gateway/app.env
exec /usr/local/bin/orvilo-device-gateway
