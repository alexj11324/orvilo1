#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_DIR="$(mktemp -d)"
trap 'rm -rf "$TEST_DIR"' EXIT
mkdir -p "$TEST_DIR/repo/.agents/acceptance/scripts/agent-gateway" "$TEST_DIR/repo/.records/env" "$TEST_DIR/gateway/bin"
cp "$SCRIPT_DIR/local-gateway-setup.sh" "$TEST_DIR/repo/.agents/acceptance/scripts/agent-gateway/"
printf 'fixture-token' > "$TEST_DIR/repo/.records/env/agent-gateway.token"
GATEWAY_REF="$(sed -n "s/^GATEWAY_REF='\(.*\)'/\1/p" "$SCRIPT_DIR/local-gateway-setup.sh")"
cat > "$TEST_DIR/gateway/bin/agent-gateway-$GATEWAY_REF" <<'GATEWAY'
#!/usr/bin/env bash
set -euo pipefail
[ "${LOBE_API_BASE_URL:-}" = 'http://localhost:3999' ] || { echo 'pinned gateway requires LOBE_API_BASE_URL' >&2; exit 1; }
[ "$SERVICE_TOKEN" = 'fixture-token' ]
[ -z "${JWKS_KEY:-}" ]
node -e 'const { keys } = JSON.parse(process.env.JWKS_PUBLIC_KEY); if (keys[0].d || keys[0].n !== "fixture") process.exit(1)'
GATEWAY
chmod +x "$TEST_DIR/gateway/bin/agent-gateway-$GATEWAY_REF"
JWKS_KEY='{"keys":[{"kty":"RSA","n":"fixture","e":"AQAB","d":"private-fixture"}]}' \
SERVER_URL=http://localhost:3999 ORVILO_GATEWAY_DIR="$TEST_DIR/gateway" \
bash "$TEST_DIR/repo/.agents/acceptance/scripts/agent-gateway/local-gateway-setup.sh" start
