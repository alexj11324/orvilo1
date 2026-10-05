#!/usr/bin/env bash
set -euo pipefail
[[ "$EUID" -eq 0 && "$(uname -s)" == Linux && "$(uname -m)" == aarch64 ]] || { echo 'Build on the ARM64 deployment host with sudo.' >&2; exit 1; }
script_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
source_sha=fed50da75b8916566f87e32fafd852a8a34e336b
build_dir="$(mktemp -d /tmp/orvilo-agent-gateway-build.XXXXXX)"
mount -t tmpfs -o size=2G,nosuid,nodev,mode=0700 tmpfs "$build_dir"
trap 'cd /; umount "$build_dir"; rmdir "$build_dir"' EXIT
curl -fsSL https://go.dev/dl/go1.26.8.linux-arm64.tar.gz -o "$build_dir/go.tar.gz"
printf '%s  %s\n' 211ffced9dcb9633a55eac6364816ec0ddd951389a740e88fa8b3337971bdda0 "$build_dir/go.tar.gz" | sha256sum -c -
tar -xzf "$build_dir/go.tar.gz" -C "$build_dir"
curl -fsSL "https://github.com/lobehub/lobehub-gateway/archive/$source_sha.tar.gz" -o "$build_dir/source.tar.gz"
printf '%s  %s\n' 6fffb0cead6b2dc039ea5ba31a21dc2dff9d68159c04d81a0ecee2885e682368 "$build_dir/source.tar.gz" | sha256sum -c -
tar -xzf "$build_dir/source.tar.gz" -C "$build_dir"
cd "$build_dir/lobehub-gateway-$source_sha"
patch -p1 < "$script_dir/backend-origin.patch"
export PATH="$build_dir/go/bin:$PATH" GOCACHE="$build_dir/go-cache" GOPATH="$build_dir/go-path" GOTMPDIR="$build_dir/go-tmp" GOTOOLCHAIN=local
mkdir -p "$GOTMPDIR"
cd "$build_dir/lobehub-gateway-$source_sha/agent-gateway-go"
[[ -z "$(gofmt -l .)" ]] || { echo 'Go formatting check failed.' >&2; exit 1; }
go vet ./...
go test -race ./...
CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o "$build_dir/agent-gateway" ./cmd/agent-gateway-go
install -m 755 "$build_dir/agent-gateway" "$script_dir/agent-gateway"
docker build -t orvilo-agent-gateway:fed50da75b89-origin-v1 "$script_dir"
python3 - "$script_dir" "$source_sha" <<'RECEIPT'
import hashlib, json, pathlib, subprocess, sys
directory = pathlib.Path(sys.argv[1])
receipt = {
    'source_sha': sys.argv[2],
    'patch_sha256': hashlib.sha256((directory / 'backend-origin.patch').read_bytes()).hexdigest(),
    'binary_sha256': hashlib.sha256((directory / 'agent-gateway').read_bytes()).hexdigest(),
    'image_id': subprocess.check_output(['docker', 'image', 'inspect', '--format', '{{.Id}}', 'orvilo-agent-gateway:fed50da75b89-origin-v1'], text=True).strip(),
    'go_version': subprocess.check_output(['go', 'version'], text=True).strip(),
}
(directory / 'build-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
RECEIPT
sha256sum "$script_dir/agent-gateway"
