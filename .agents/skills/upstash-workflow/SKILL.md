---
name: upstash-workflow
description: 'Use for current Hatchet workflows, durable execution and migration from retired Upstash/QStash handlers. The directory name is a compatibility entry point.'
user-invocable: false
---

# Hatchet Workflows

The current runtime uses Hatchet. This skill keeps its old directory name so
existing handoffs still resolve; Upstash/QStash is no longer an implementation
option in this repository. Do not install `@upstash/workflow`, add QStash HTTP
handlers, or restore the removed welcome workflows from old examples.

## Owners

- `src/libs/hatchet/index.ts`: shared client, enqueue/cancel and task-id handling.
- `apps/server/src/services/hatchet/taskNames.ts`: task names.
- `apps/server/src/hatchet/worker.ts`: worker registration.
- `apps/server/src/hatchet/tasks.ts`: core tasks and scheduled execution.
- `apps/server/src/hatchet/workflowTasks.ts`: durable workflow task registration.
- `apps/server/src/hatchet/collaborationOutbox.ts`: collaboration outbox delivery.
- `apps/server/src/workflows/`: domain workflow implementations.
- `docker-compose/deploy/docker-compose.yml`: optional `hatchet` worker profile.

Trace the existing producer, persisted dispatch/outbox state, registered task,
retry boundary and completion/cancellation consumer before adding a workflow.
Reuse the shared client and durable context. Preserve idempotency across retries
and recovery; do not introduce a second queue or a parallel scheduler.

## Configuration and execution

`AGENT_RUNTIME_MODE=queue` selects queued agent execution and requires
`HATCHET_CLIENT_TOKEN` plus a reachable Hatchet engine. The Compose `hatchet`
profile starts the worker, not the engine. SDK connection variables and worker
settings are documented in `.env.example` and the Compose environment templates.
`APP_URL` / `INTERNAL_APP_URL` remain application URLs, not QStash endpoints.

Use `bun run dev:hatchet` for the development worker. The image runs
`node hatchet-worker/worker.mjs`; keep registration and deployment settings in
sync. The worker needs the same internal service endpoints as the web producer,
including `COLLABORATION_GATEWAY_URL` for collaboration outbox delivery.

## Validation

Use the nearest existing task/workflow tests for retries, duplicate dispatch,
cancellation and failure recovery. Run scoped checks under the repository's
`testing` skill. Exercise the real worker/engine when product behavior changes;
unit tests alone do not establish deployment connectivity.
