#!/usr/bin/env bash
# Exercises upgrade.sh against stand-ins for docker, systemctl, curl and sleep.
# upgrade.sh only runs as root on Linux ARM64, so this runs in CI:
#   sudo bash docker-compose/deploy/agent-gateway/test-upgrade.sh
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf -- "$work"' EXIT
commit=0123456789abcdef0123456789abcdef01234567
new_tag=orvilo-agent-gateway:aaaaaaaaaaaa
new_id="sha256:$(printf 'a%.0s' $(seq 1 64))"
old_tag=orvilo-agent-gateway:old
old_id="sha256:$(printf 'b%.0s' $(seq 1 64))"
export STATE="$work/state" AGENT_GATEWAY_SERVICE_DIR="$work/service"

mkdir -p "$work/bin"
cat > "$work/bin/docker" <<'STUB'
#!/usr/bin/env bash
case "$1" in
  load) cat > /dev/null ;;
  image) cat "$STATE/loaded-image" ;;
  inspect) cat "$STATE/running-image" ;;
  tag) echo "$2 $3" >> "$STATE/tags" ;;
esac
STUB
cat > "$work/bin/systemctl" <<'STUB'
#!/usr/bin/env bash
# The unit runs whatever image the installed launcher names.
if grep -q "$NEW_TAG" "$AGENT_GATEWAY_SERVICE_DIR/start.sh"; then echo "$NEW_ID"; else echo "$OLD_ID"; fi > "$STATE/running-image"
STUB
cat > "$work/bin/curl" <<'STUB'
#!/usr/bin/env bash
if [[ -e "$STATE/new-image-unhealthy" && "$(cat "$STATE/running-image")" == "$NEW_ID" ]]; then exit 7; fi
case "$*" in
  *http_code*) printf 401 ;;
  *) printf OK ;;
esac
STUB
printf '#!/usr/bin/env bash\n' > "$work/bin/sleep"
chmod +x "$work/bin"/*
export PATH="$work/bin:$PATH" NEW_TAG="$new_tag" NEW_ID="$new_id" OLD_ID="$old_id"

fresh() {
  rm -rf "$STATE" "$AGENT_GATEWAY_SERVICE_DIR" "$work/bundle"
  mkdir -p "$STATE" "$AGENT_GATEWAY_SERVICE_DIR" "$work/bundle"
  printf 'exec docker run %s\n' "$old_tag" > "$AGENT_GATEWAY_SERVICE_DIR/start.sh"
  echo "$old_id" > "$STATE/running-image"
  echo "$new_id" > "$STATE/loaded-image"
  cp "$script_dir/upgrade.sh" "$work/bundle/"
  printf 'exec docker run %s\n' "$new_tag" > "$work/bundle/start.sh"
  echo fixture | gzip > "$work/bundle/image.tar.gz"
  echo fixture > "$work/bundle/build-info.txt"
  printf '{"commit_sha":"%s","run_id":"7","run_attempt":"1","source_sha":"aaaaaaaaaaaa0000","image_tag":"%s","image_id":"%s","go_version":"go1.26.8","target":"linux/arm64"}\n' "$commit" "$new_tag" "$new_id" > "$work/bundle/build-receipt.json"
  (cd "$work/bundle" && sha256sum image.tar.gz build-info.txt start.sh upgrade.sh build-receipt.json > SHA256SUMS)
}
upgrade() { bash "$work/bundle/upgrade.sh" "$1" "$commit" 7 1; }
installed() { grep -q -- "$1" "$AGENT_GATEWAY_SERVICE_DIR/start.sh"; }
snapshot="$work/service/upgrades/$commit-7-1"

fresh
upgrade activate > /dev/null
installed "$new_tag"
[[ "$(cat "$STATE/running-image")" == "$new_id" && -f "$snapshot/activation-receipt.json" ]]
if upgrade activate > /dev/null 2>&1; then echo 'a second activation of the same run must be refused' >&2; exit 1; fi
upgrade rollback > /dev/null
installed "$old_tag"
[[ "$(cat "$STATE/running-image")" == "$old_id" && "$(cat "$STATE/tags")" == "$old_id $old_tag" ]]

fresh
touch "$STATE/new-image-unhealthy"
if upgrade activate > /dev/null 2>&1; then echo 'an unhealthy image must fail the upgrade' >&2; exit 1; fi
installed "$old_tag"
[[ "$(cat "$STATE/running-image")" == "$old_id" && ! -e "$snapshot/activation-receipt.json" ]]

fresh
echo "sha256:$(printf 'c%.0s' $(seq 1 64))" > "$STATE/loaded-image"
if upgrade activate > /dev/null 2>&1; then echo 'an image that differs from the receipt must fail' >&2; exit 1; fi
installed "$old_tag"

fresh
echo tampered >> "$work/bundle/start.sh"
if upgrade activate > /dev/null 2>&1; then echo 'a changed bundle must fail its checksum' >&2; exit 1; fi
[[ ! -e "$snapshot" ]]
echo 'upgrade.sh: all cases passed'
