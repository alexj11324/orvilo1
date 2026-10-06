# Current 1dd Task API acceptance

Frozen source: `1dd452becde9cc2dfbdfd24c360db7be80eccce4`. Real local API `127.0.0.1:31598`; isolated database only. No ACP, model run, watchdog, source edit, or synthetic execution outcome.

Only new fixtures RF-8/RF-9/RF-10 were created. Existing maintained `taskExecutor.editTask` imported without a framework/polyfill and used actual HTTP transport. Stale domain revision received HTTP409 `TASK_REVISION_CONFLICT`, returned success=false, and issued zero dependency mutations. Fresh domain revision received HTTP200, followed by actual dependency add/remove HTTP200; A's dependency changed C→B.

Agent-authored comment was created, updated, and deleted through actual API. Readback before deletion showed Journey authorAgentId and null authorUserId. Durable comment-change events report source=agent for created/updated/deleted and requirementRevision2 throughout, while domain revision advances. Deleted comment is absent.

All three normal pause requests returned HTTP200. Persisted status and workflow remain backlog because these Tasks have no execution; do not describe them as persisted paused. All are projectless with zero task_dispatches and task_topics, so no project automatic intake applies. Original Journey agency_config+params fingerprint remains62e97e28c16c9fff1d26914811867f8d91bb289cc88124fc45fd0e22883180b4.

The first temporary readback used a nonexistent table after successful API comment edits. Its finally block paused the same three fixtures; the corrected run resumed those exact IDs and created no additional Tasks. A later read-only query corrected the Tasks creator column. These harness errors and successful API provenance remain in the JSON evidence.

Evidence: `api-acceptance-1dd-results.json`, `task-readback-1dd-results.json`. Native host-switch acceptance is separately owned by root; this API result does not claim GUI coverage.
