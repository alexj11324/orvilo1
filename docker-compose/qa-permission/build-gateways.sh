#!/usr/bin/env bash
set -euo pipefail
[[ "${GITHUB_ACTIONS:-}" == true && "$(uname -m)" == aarch64 ]] || exit 1
[[ "${GITHUB_SHA:-}" =~ ^[a-f0-9]{40}$ && "$(git rev-parse HEAD)" == "$GITHUB_SHA" ]] || exit 1
bundle="${RUNNER_TEMP:?}/qa-gateways"
build_dir="$(mktemp -d "$RUNNER_TEMP/qa-gateway-source.XXXXXX")"
trap 'rm -rf -- "$build_dir"' EXIT
mkdir -p "$bundle"
source_sha=fed50da75b8916566f87e32fafd852a8a34e336b
curl -fsSL https://go.dev/dl/go1.26.8.linux-arm64.tar.gz -o "$build_dir/go.tar.gz"
printf '%s  %s\n' 211ffced9dcb9633a55eac6364816ec0ddd951389a740e88fa8b3337971bdda0 "$build_dir/go.tar.gz" | sha256sum -c -
tar -xzf "$build_dir/go.tar.gz" -C "$build_dir"
curl -fsSL "https://github.com/lobehub/lobehub-gateway/archive/$source_sha.tar.gz" -o "$build_dir/source.tar.gz"
printf '%s  %s\n' 6fffb0cead6b2dc039ea5ba31a21dc2dff9d68159c04d81a0ecee2885e682368 "$build_dir/source.tar.gz" | sha256sum -c -
tar -xzf "$build_dir/source.tar.gz" -C "$build_dir"
repo_root="$PWD"
cd "$build_dir/lobehub-gateway-$source_sha"
patch -p1 < "$repo_root/docker-compose/deploy/agent-gateway/backend-origin.patch"
patch -p1 < "$repo_root/docker-compose/deploy/device-gateway/workspace.patch"
export PATH="$build_dir/go/bin:$PATH" GOCACHE="$build_dir/go-cache" GOPATH="$build_dir/go-path" GOTMPDIR="$build_dir/go-tmp" GOTOOLCHAIN=local
mkdir -p "$GOTMPDIR"
for gateway in agent-gateway device-gateway; do
  (
    cd "$gateway-go"
    [[ -z "$(gofmt -l .)" ]]
    go vet ./...
    go test -race ./...
    CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -trimpath -ldflags='-s -w' -o "$bundle/$gateway" "./cmd/$gateway-go"
  )
done
cp "$repo_root/docker-compose/qa-permission/Gateway.Dockerfile" "$bundle/Dockerfile"
printf '{"harness_sha":"%s","gateway_source_sha":"%s"}\n' "$GITHUB_SHA" "$source_sha" > "$bundle/source-receipt.json"
(cd "$bundle" && sha256sum agent-gateway device-gateway Dockerfile source-receipt.json > SHA256SUMS)
