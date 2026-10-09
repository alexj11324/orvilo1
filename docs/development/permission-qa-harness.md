# Permission QA harness

This temporary tooling target verifies product candidate `56eb1e0b3e1d1d39af4c64ce84d717b7599e9c71` before protected merge. It does not publish historical private resources or change production grants. Production remains on its independently recorded deployment revision.

The existing `deploy-orvilo1.yml` accepts `qa_permission: true` only on `codex/permission-qa-current`. Its normal build, promotion, retag and production deployment jobs are excluded in this mode. The QA admission rejects production switches, foreign/floating images, other refs and every source delta outside the enumerated tooling files. The harness revision and immutable candidate image digest are separate receipt fields.

First use the existing workflow on the product branch with `build: true`, `deploy: false`, and record the successful build run ID. After the exact candidate and harness quality gates pass, the QA dispatch requires this `qa_candidate_build_run` ID. It verifies the build's actual SHA/job/digest against GHCR before deployment. Gateway binaries use the existing reviewed patches against pinned upstream `fed50da75b8916566f87e32fafd852a8a34e336b`, built/tested on ARM64 CI and published by digest.

The QA-only host directory is `/var/lib/orvilo1-qa-permission-20261008`. Every container/network/volume is named for this target. PostgreSQL, Redis, S3 storage, Mailpit and Hatchet are fresh. Queue/resume/heartbeat acceptance uses the normal Hatchet Lite quickstart and `hatchet-admin token create` against its isolated tenant; no production queue token is copied. The app migration must finish before the worker starts. Device/Agent gateway service credentials and JWKS are generated for this target. Public gateway URLs preserve the supported URL prefix:

- Product: `https://qa-permission.aspectlylabs.com`
- Accounts: `https://accounts-qa-permission.aspectlylabs.com`
- Device: `https://qa-permission.aspectlylabs.com/_qa/device-gateway`
- Agent: `https://qa-permission.aspectlylabs.com/_qa/agent-gateway`

The auth portal reuses maintained auth code with a sibling Worker config. It exchanges real Clerk sessions into the fresh QA app database; it does not reuse production Orvilo auth sessions. Clerk issuer stays the existing legitimate provider. QA CORS/authorized-party and OIDC callback origins are exact; the app auth cookie is host-only. Normal login and Electron acceptance must still be exercised after startup.

Invitations use the existing authenticated Nodemailer SMTP implementation and an internal Mailpit transport restricted to the six named QA recipient addresses. It has no relay or public SMTP/UI. Mailpit's loopback inbox is available to the operator at host port `13250` via authorized SSH; invitation bodies/tokens stay in private temporary evidence files.

Existing authorized repository GitHub secrets supply SSH, known-host identity, Clerk verifier, and Cloudflare DNS credentials. The dedicated GitHub Environment `qa-permission-20261008` must receive `QA_CLOUDFLARE_API_TOKEN` through the authorized credential workflow for the sibling auth Worker; the QA job does not borrow the production Environment. Fresh application/storage/SMTP/queue keys are generated into mode-0600 files inside a task-only mode-0700 runner directory and `/run/orvilo-qa-permission` on the host. Finally traps and an ownership-checked always step remove these input env/token files on success or failure. Running containers retain their required environment; fresh Hatchet configuration persists only in its QA volume. No resolved Compose environment, credential-bearing Docker inspect or raw startup logs are published. The deployment receipt contains only source/digest/target identities.

Preflight requires both hostname records, QA Worker name, host deployment path, container/volume names and loopback ports to be unused. It verifies Cloudflare zone/account ownership and creates only the new proxied QA A record and sibling Worker domain. Existing wildcard origin TLS covers the QA product hostname; public access uses Cloudflare edge TLS. Unknown preview data and retired staging routes are not reused. This initial implementation does not automatically redeploy or rotate keys over retained data: an existing QA target fails admission and needs an explicitly scoped teardown.

Local owning checks are Node admission/dry-run tests, JavaScript syntax, shellcheck, actionlint and Compose YAML parsing. They prove tool boundaries, not cloud startup, migrations, normal auth, runtime queue handling or Electron role/Device outcomes. All such acceptance remains pending until CI and real product evidence exist.
