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
  tag) [[ ! -e "$STATE/tag-fails" ]] || exit 1; echo "$2 $3" >> "$STATE/tags" ;;
esac
STUB
cat > "$work/bin/systemctl" <<'STUB'
#!/usr/bin/env bash
# The unit runs whatever image the installed launcher names.
echo restart >> "$STATE/restarts"
if grep -q "$NEW_TAG" "$AGENT_GATEWAY_SERVICE_DIR/start.sh"; then echo "$NEW_ID"; else echo "$OLD_ID"; fi > "$STATE/running-image"
STUB
cat > "$work/bin/curl" <<'STUB'
#!/usr/bin/env bash
if [[ -e "$STATE/new-image-unhealthy" && "$(cat "$STATE/running-image")" == "$NEW_ID" ]]; then exit 7; fi
case "$*" in
  *http_code*) if [[ -e "$STATE/open-publication" ]]; then printf 200; else printf 401; fi ;;
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
upgrade() { bash "$work/bundle/upgrade.sh" "$1" "$commit" 7 1 > "$work/out" 2>&1; }
# The upgrade must fail, and for the stated reason.
fails_with() {
  if upgrade activate; then echo "expected a failure: $1" >&2; exit 1; fi
  grep -q -- "$1" "$work/out" || { echo "expected '$1', got:" >&2; cat "$work/out" >&2; exit 1; }
}
installed() { grep -q -- "$1" "$AGENT_GATEWAY_SERVICE_DIR/start.sh"; }
restarts() { [[ -e "$STATE/restarts" ]] && wc -l < "$STATE/restarts" | tr -d ' ' || echo 0; }
running() { cat "$STATE/running-image"; }
snapshot="$work/service/upgrades/$commit-7-1"

# A healthy image is installed; the same run cannot be activated twice; rollback returns.
fresh
upgrade activate
installed "$new_tag"
[[ "$(running)" == "$new_id" && "$(restarts)" == 1 && -f "$snapshot/activation-receipt.json" ]]
fails_with 'already has a snapshot'
installed "$new_tag"
upgrade rollback
installed "$old_tag"
[[ "$(running)" == "$old_id" && "$(restarts)" == 2 && "$(cat "$STATE/tags")" == "$old_id $old_tag" ]]

# An unhealthy image was started, then replaced by the previous one.
fresh
touch "$STATE/new-image-unhealthy"
fails_with 'Agent Gateway health failed'
grep -q 'Restored the Agent Gateway' "$work/out"
installed "$old_tag"
[[ "$(running)" == "$old_id" && "$(restarts)" == 2 && ! -e "$snapshot/activation-receipt.json" ]]

# A gateway that accepts unauthenticated publications is not kept.
fresh
touch "$STATE/open-publication"
fails_with 'was not rejected'
installed "$old_tag"
[[ "$(running)" == "$old_id" && "$(restarts)" == 2 ]]

# A restore that cannot complete says so and does not claim success.
fresh
touch "$STATE/new-image-unhealthy" "$STATE/tag-fails"
fails_with 'Restore failed'
if grep -q 'Restored the Agent Gateway' "$work/out"; then echo 'a failed restore must not report success' >&2; exit 1; fi

# An image that differs from the receipt is never started.
fresh
echo "sha256:$(printf 'c%.0s' $(seq 1 64))" > "$STATE/loaded-image"
fails_with 'differs from the CI receipt'
installed "$old_tag"
[[ "$(restarts)" == 0 && "$(cat "$STATE/tags")" == "$old_id $old_tag" ]]

# A changed bundle stops at its checksum, before any snapshot.
fresh
echo tampered >> "$work/bundle/start.sh"
fails_with 'start.sh: FAILED'
[[ "$(restarts)" == 0 && ! -e "$snapshot" && ! -e "$snapshot.partial" ]]

# A snapshot that cannot be completed leaves nothing that blocks a retry.
fresh
echo unreadable > "$STATE/running-image"
fails_with 'Could not read the running image'
[[ "$(restarts)" == 0 && ! -e "$snapshot" ]]
echo 'upgrade.sh: all cases passed'
