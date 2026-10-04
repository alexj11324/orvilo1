# Self-hosted device gateway

This directory restores the existing `device-gateway.aspectlylabs.com` endpoint
from the standalone upstream Go device service in LobeHub Gateway 0.4.0,
commit `fed50da75b8916566f87e32fafd852a8a34e336b`.

`workspace.patch` adds the current Orvilo workspace protocol: separate personal
and workspace pools, workspace JWT purpose/subject/claim checks, and workspace
HTTP dispatch. API-key authentication accepts only the configured Orvilo API
URL. The standalone listener stays on `127.0.0.1:28788`; nginx owns public ingress.

## Build and deploy through CI

[device-gateway.yml](../../../.github/workflows/device-gateway.yml) builds on
`ubuntu-24.04-arm`. Pushes that change this directory or its workflow, and pull
requests targeting `canary`, run the build without deploying. The build verifies
both pinned archive hashes, applies the reviewed patch, checks Go formatting,
runs `go vet` and race tests, and builds a static Linux ARM64 binary with Go
1.26.8. `build.sh` rejects manual invocation and never installs onto a host.

The CI artifact contains the binary, deployment files, patch, Go build info,
commit/source/patch/binary receipt, and a SHA256 manifest. Its name includes the
commit, CI run ID, and run attempt. Production deployment downloads only that
same-run artifact and verifies its hashes and receipt before transferring it.

After merging into `canary`, manually dispatch **Build and deploy device gateway**
from `canary` with `deploy` enabled. Deployment requires this commit's successful
`Required Quality Gate`, the `production` environment, and the existing
`orvilo1-production-deploy` concurrency group. Feature branches can build but
cannot deploy. Rerun all jobs after a failure so the build receipt and artifact
match the new run attempt.

No gateway or application build runs on the production host. Activation snapshots
the existing host-local Compose override, app version, original app/worker image
IDs, service files, binary, and endpoint nginx configuration. It exports only the
public RSA JWK from the running app, starts the verified gateway artifact, appends
its runtime env file to `orvilo` and `hatchet-worker`, and recreates only those two
containers using their original image IDs with `--no-build --pull never`.
The override updater retains the existing Compose `!override` sequence tag and
rejects unknown tags before writing. Other service settings remain intact.

Only after origin verification succeeds does CI create or update the endpoint's
single proxied A record. Other DNS names and conflicting record types are not
modified. CI then checks the public health response and unauthenticated rejection.
The activation receipt is attached to the workflow run.

## Required configuration

Existing repository/environment secrets:

- `ORACLE_HOST`: the origin IPv4 address used by SSH and the endpoint A record.
- `ORACLE_SSH_KEY`: the existing origin deployment key.
- `ORACLE_SSH_KNOWN_HOSTS`: pinned SSH host keys; this workflow does not discover
  host keys during deployment.

Gateway DNS configuration:

- `CLOUDFLARE_DNS_API_TOKEN`: a DNS-edit token for the existing endpoint zone,
  sourced from the canonical Secret Manager value. Existing Worker/preview
  credentials are not overwritten.
- Repository variables `CLOUDFLARE_ZONE_ID` and `CLOUDFLARE_ACCOUNT_ID`.

The origin must already have the canonical gateway bootstrap credential at
`/etc/orvilo-device-gateway/service-token`, owned by root with mode 0400. The
workflow validates its format and never uploads, logs, or replaces it. systemd
loads it into its private credential directory; `start.sh` creates
`/run/orvilo-device-gateway/app.env` on tmpfs. Existing plaintext `.env` credentials
are not edited. The app keeps its private signing key.

Activation requires the existing production override, running app and worker,
Docker Compose, nginx, Python 3 with PyYAML, and the existing wildcard origin
certificate. No host package installation is performed.

## Verification and rollback

Origin checks cover the gateway's `OK` health response, unauthenticated HTTP 401,
unchanged app version and app/worker image IDs, worker readiness, matching gateway
credentials in both containers, and the running gateway executable's exact CI
binary hash. The resulting receipt records the rollback snapshot directory and
original images, without credentials.

Run the focused deployment checks locally with:

```sh
python3 docker-compose/deploy/device-gateway/test-deployment.py
shellcheck docker-compose/deploy/device-gateway/{build,activate,dns,start}.sh
actionlint .github/workflows/device-gateway.yml
```

Gateway compilation and its Go checks run only in the CI build job. Final product
acceptance additionally verifies production-signed personal/workspace WebSocket
authentication, cross-workspace rejection, distinct pool listings, and a real
device RPC. Development JWTs are not trusted by the production gateway.

Activation failures after the snapshot automatically restore the saved override,
original images, binary/service files, and only this endpoint's nginx site. A
later CI failure restores the endpoint DNS snapshot and then the origin snapshot.
Snapshots stay root-only under `/var/lib/orvilo1/device-gateway/rollback/`; CI logs
record their paths. The canonical service token is retained for recovery. If a
rollback itself fails, the workflow fails and reports the snapshot for inspection.
