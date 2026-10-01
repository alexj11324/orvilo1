# Embedded harness runner image — the supervised container's PID 1.
#
#   cd packages/prime-harness
#   node scripts/build.mjs            # emits dist/runner.mjs + dist/runner.manifest.json
#   SHA=$(node -p "require('./dist/runner.manifest.json').sha256")
#   docker build -f Dockerfile --build-arg HARNESS_BUNDLE_SHA256=$SHA -t orvilo/prime-harness .
#
# The supervisor launches `env -i ... /usr/local/bin/node
# /opt/orvilo/prime-harness/runner.mjs` inside this image. Same pin model as
# the ACP prime-agent image (scripts/acceptance/PrimeProtocol.Dockerfile):
# the sha256 image digest is the artifact pin, the labels carry the provenance
# a host-side inspect verifies before trusting the bundle.
FROM public.ecr.aws/docker/library/node:22-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c

# Bundle digest the image was built for — required so a mislabeled image
# cannot masquerade as the pinned artifact.
ARG HARNESS_BUNDLE_SHA256
COPY dist/runner.mjs /opt/orvilo/prime-harness/runner.mjs
COPY dist/runner.manifest.json /opt/orvilo/prime-harness/runner.manifest.json
RUN chmod -R a+rX /opt/orvilo && test -n "$HARNESS_BUNDLE_SHA256"

LABEL orvilo.prime.commit="7d442aafa985f9342134fac16c2ef41f03fb45c1" \
      orvilo.prime.version="0.9.8" \
      orvilo.prime-harness.bundle.sha256="${HARNESS_BUNDLE_SHA256}"
