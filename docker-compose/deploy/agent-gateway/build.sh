#!/usr/bin/env bash
set -euo pipefail

[[ "${GITHUB_ACTIONS:-}" == true ]] || { echo 'Build the agent gateway through GitHub Actions only.' >&2; exit 1; }
[[ "$(uname -s)" == Linux && "$(uname -m)" == aarch64 ]] || { echo 'The build requires the ubuntu-24.04-arm CI runner.' >&2; exit 1; }
[[ "${GITHUB_SHA:-}" =~ ^[a-f0-9]{40}$ && "$(git rev-parse HEAD)" == "$GITHUB_SHA" ]] || { echo 'The checkout must match the CI commit.' >&2; exit 1; }
script_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
source_sha=81f26f8af942484da644921eae08371f834bfd72
image_tag="orvilo-agent-gateway:${source_sha:0:12}"
# The launcher names the image it runs, so the two cannot drift apart.
grep -q -- " $image_tag\$" "$script_dir/start.sh" || { echo "start.sh must run $image_tag." >&2; exit 1; }
build_dir="$(mktemp -d "${RUNNER_TEMP:?}/agent-gateway-build.XXXXXX")"
trap 'rm -rf -- "$build_dir"' EXIT
bundle_dir="${1:?Pass the artifact bundle directory.}"
mkdir -p "$bundle_dir"
bundle_dir="$(cd -- "$bundle_dir" && pwd)"

curl -fsSL https://go.dev/dl/go1.26.8.linux-arm64.tar.gz -o "$build_dir/go.tar.gz"
printf '%s  %s\n' 211ffced9dcb9633a55eac6364816ec0ddd951389a740e88fa8b3337971bdda0 "$build_dir/go.tar.gz" | sha256sum -c -
tar -xzf "$build_dir/go.tar.gz" -C "$build_dir"
curl -fsSL "https://github.com/alexj11324/orvilo-gateway/archive/$source_sha.tar.gz" -o "$build_dir/source.tar.gz"
printf '%s  %s\n' 13679fbe696db34f4ecca58f23d3138b4879045cfe7df33e7c6b848573f46505 "$build_dir/source.tar.gz" | sha256sum -c -
tar -xzf "$build_dir/source.tar.gz" -C "$build_dir"

export PATH="$build_dir/go/bin:$PATH"
export GOCACHE="$build_dir/go-cache" GOPATH="$build_dir/go-path" GOTMPDIR="$build_dir/go-tmp" GOTOOLCHAIN=local
mkdir -p "$GOTMPDIR" "$build_dir/image"
cd "$build_dir/orvilo-gateway-$source_sha/agent-gateway-go"
[[ "$(go version)" == 'go version go1.26.8 linux/arm64' ]]
unformatted="$(gofmt -l .)"
[[ -z "$unformatted" ]] || { printf 'Go formatting failed:\n%s\n' "$unformatted" >&2; exit 1; }
go vet ./...
go test -race ./...
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -trimpath -ldflags='-s -w' -o "$build_dir/image/agent-gateway" ./cmd/agent-gateway-go
go version -m "$build_dir/image/agent-gateway" > "$bundle_dir/build-info.txt"

cp "$script_dir/Dockerfile" "$build_dir/image/"
docker build --tag "$image_tag" "$build_dir/image"
docker save "$image_tag" | gzip -n > "$bundle_dir/image.tar.gz"
cp "$script_dir"/{start.sh,upgrade.sh} "$bundle_dir/"

python3 - "$bundle_dir" "$source_sha" "$image_tag" "$build_dir/image/agent-gateway" <<'PY'
import hashlib, json, os, pathlib, re, sys, tarfile
bundle = pathlib.Path(sys.argv[1])
# The config digest is the image ID a classic image store reports after `docker load`,
# whichever store built it.
with tarfile.open(bundle / 'image.tar.gz') as archive:
    config = json.load(archive.extractfile('manifest.json'))[0]['Config']
image_id = 'sha256:' + re.search(r'[a-f0-9]{64}', config).group()
receipt = {
    'commit_sha': os.environ['GITHUB_SHA'],
    'source_sha': sys.argv[2],
    'image_tag': sys.argv[3],
    'image_id': image_id,
    'binary_sha256': hashlib.sha256(pathlib.Path(sys.argv[4]).read_bytes()).hexdigest(),
    'go_version': 'go1.26.8',
    'target': 'linux/arm64',
    'run_id': os.environ['GITHUB_RUN_ID'],
    'run_attempt': os.environ['GITHUB_RUN_ATTEMPT'],
}
(bundle / 'build-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
PY
cd "$bundle_dir"
sha256sum image.tar.gz build-info.txt start.sh upgrade.sh build-receipt.json > SHA256SUMS
sha256sum -c SHA256SUMS
