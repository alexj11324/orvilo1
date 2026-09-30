# MCP Events draft restoration provenance

Audit date: 2026-09-30. Source: the two complete handoff messages from thread
`01a0f302-a431-7739-bf46-0e55031f60c0`, based on
`28dc3bbad36e4661f8d09154ff8b017cf5cadaeb`. Cloud candidate inspected read-only:
`e2aa7191`. This report does not treat a final candidate hash as proof of the initial
restoration. No repository file was changed for this audit.

| Original file | Expected original blob prefix | Original restoration evidence | Subsequent cloud changes |
| --- | --- | --- | --- |
| `apps/server/src/services/mcpEvents/__tests__/inbox.test.ts` | `042294f7` | Verified before changes: `042294f785a51bf1ad54cd8c071eab181a1b1f9c`, acceptance agent tool chunk `7945aa`, exit 0 | Added exact-expiry ACK fencing and concurrent disjoint-claim tests; formatting |
| `apps/server/src/services/mcpEvents/acceptance.test.ts` | `9d66c32e` | Verified before changes: `9d66c32ed0105e54b51400d61ede7f8335c548e8`, acceptance agent tool chunk `7945aa`, exit 0 | Added delayed-commit ACK and real SQL watermark-failure rollback/retry tests; lint and formatting |
| `apps/server/src/services/mcpEvents/adapter.ts` | `0177c3ce` | Protocol agent reports pre-edit tool chunk `9402fc`, exit 0: `0177c3ced0e0027c76b99b42005a9c459fce70e0` | ESLint formatting and equivalent type/method style |
| `apps/server/src/services/mcpEvents/deliveryTypes.ts` | `1093b194` | **Not verified.** Durable agent confirms no pre-edit `git hash-object`; manually restored from inherited text | Shared types moved to `packages/types/src/mcpEvents.ts` and re-exported; inbox settlement gained `preserveAttempts` |
| `apps/server/src/services/mcpEvents/inbox.ts` | `9b6a683e` | **Not verified.** Durable agent confirms its first written version already included the duplicate-cursor fix; no unmodified original was saved or hashed | Cursor update requires inserted receipt; challenge revision fencing; automatic revoke CAS/boolean result; preserve normal-wait attempt budget; formatting |
| `apps/server/src/services/mcpEvents/protocol.ts` | `f0502260` | Protocol agent reports pre-edit tool chunk `9402fc`, exit 0: `f05022605b1f4274efc79fe7d7d400437c27ef2c` | ESLint formatting and equivalent regular-expression style |
| `apps/server/src/services/mcpEvents/receiver.ts` | `1fe371b8` | Protocol agent reports pre-edit tool chunk `9402fc`, exit 0: `1fe371b864da6ec5e68370c12737bde891d9c0c4` | Pass challenge expected revision; obtain fresh time after body read and recheck signature freshness/binding expiry; formatting |
| `apps/server/src/services/mcpEvents/subscription.ts` | `20509064` | Protocol agent reports pre-edit tool chunk `9402fc`, exit 0: `20509064d4d65004ac0dae20e8abc437035a2a6a` | Preserve valid keys after ambiguous rotation ACK; report actual revoked status; revision-fenced automatic revoke and cleanup; configurable minimum refresh window and short-grant rejection; formatting |
| `docs/mcp-events-acceptance.md` | `254c03bc` | Verified before changes: `254c03bc6281d6eda2ab498a3ccffbd39d87cc33`, acceptance agent tool chunk `45e35f`; its hash output precedes an unrelated Vitest dependency-resolution failure (the combined shell command exited 1) | Replaced obsolete Mac-only status with Linux evidence; added integration/migration/review evidence and explicit execution limits |
| `packages/database/src/schemas/mcpEvents.ts` | `075cc4bd` | **Not verified.** Durable agent confirms no pre-edit `git hash-object`; manually restored from inherited text | Added trigger and trigger-run tables; shared JSONB types; migration-integration comment; formatting |

## Interpretation

Seven of ten original files have a matching pre-edit hash record: three witnessed
in the acceptance agent's own tool output and four reported by the protocol agent
with the exact tool chunk and full hashes. Three original restorations remain
unverified. In particular, inbox.ts was not first materialized as an unchanged
original draft. This is a provenance gap, not evidence that every subsequent line
is wrong; it prevents claiming all ten were byte-exact restorations.

The final cloud candidate and its tests are separate evidence. Passing tests or a
final cloud Git blob cannot retroactively establish the three missing original
hash checks. New cloud files (worker, filter, adapters, routes, UI, migration tests,
etc.) were not present in the ten-file handoff and are not listed as restorations.
