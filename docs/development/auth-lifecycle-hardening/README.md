# Authentication lifecycle hardening verification

Behavior revision: `a09e74d94d16bdd01bad8055f93d88c0c58ad12c`, integrated with canary `27f398621e48c7c7b7fdd10847152b345374153b`. A later documentation-only commit does not change these verified authentication sources. The PR records its exact head and CI runs separately.

## Outcomes

| Boundary                | Observed result                                                                                                                                                                                                                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Refresh rotation        | Actual installed provider and PostgreSQL reject consumed-token replay at 30 and 300 seconds, revoke the same family, and leave an unrelated grant usable. Concurrent consume returns 200/400; no usable replacement branch survives.                                                               |
| Protected credentials   | Genuine Electron save and same-profile restart read protected credentials. The actual npm-packed CLI uses the OS keyring, survives a fresh process, rotates credentials normally, and reports unsupported storage honestly after one successful token poll.                                        |
| API lifetime and logout | Ordinary API JWT lifetime is 900 seconds and the signed grant matches current server state. Native and CLI ordinary logout change the captured prior access from 200 to 401; unrelated grants remain 200.                                                                                          |
| Web session lifecycle   | Genuine Google login and reload use a 64-character HttpOnly/Secure bearer with only its digest stored. Idle expiry, absolute expiry and renewal capped at 30 days pass. Revoking the fresh owned Clerk session immediately rejects its cookie; all 11 protected session statuses remain unchanged. |
| Upstream failure        | Actual Next session requests return 503 for deliberate upstream 500 and held partial JSON. The whole test row, idle expiry and browser cookie are preserved without renewal or Set-Cookie. Restoring the normal upstream returns 200.                                                              |
| Bounded local cleanup   | Actual Electron and packaged CLI logout controls return honest remote failures and clear local state after held transports: approximately 20.012 and 10.751 seconds respectively.                                                                                                                  |

The unavailable/basic_text native storage controls are dependency simulations on macOS. Network failure and expiry controls use explicitly owned fixtures; normal Google, native OAuth, CLI device OAuth, protected-store readback and ordinary logout are genuine flows. This evidence does not establish signed shipping artifacts or Linux/Windows storage behavior.

The first native attempt directly recorded the original nine authorization fields, state and S256, then timed out before delayed consent. The successful ordinary Retry used the same maintained artifact and produced the canonical authenticated result; direct retry state/verifier equalities were not separately retained. Their validation is supported by the unavoidable owning controller/SDK gates plus actual successful execution and provider negative controls. The evidence keeps direct observations and that inference distinct.

Legacy ordinary API tokens without the signed grant binding and unbound legacy Web sessions fail closed and require a normal verified authentication flow. Backfill preserves rows, owners and creation timestamps while replacing raw bearers with digests.

## Revisions and migration integration

The original receipts retain their actual c9, fbcc and a597 source/build attribution. The saved test-only and CLI-only comparisons explain reuse for unaffected paths. After rebase, **98 of 101 previously frozen paths remain byte-identical**; the three differences are migration artifacts. Auth SQL moved from the unshipped 0206 draft to generated 0207 with identical bytes, and the auth snapshot content is identical apart from generated lineage. Upstream shipped 0206 SQL and snapshot are preserved. The evidence record `auth-source-integration-equivalence.json` supplies the paths and comparison results.

The maintained migration command was executed twice at a09 on the isolated candidate database. It normally applied upstream task 0206 and auth 0207 once each and then remained idempotent, with automatic backfill 0 changed / 0 remaining. The one session row retained 0 raw bearers, 8,192 heap bytes and 65,536 total relation bytes. The migrator reported 86 ms and 64 ms, including its default backfill; these are observed candidate-scale timings, not production performance. Its prior unshipped auth-206 marker was preserved as candidate history, not rewritten or claimed as shipped history.

Focused integration checks passed 33 tests; the server-DB case is reserved for remote CI. Independent database, code and TypeScript integration reviews approved the generated artifacts. The retained independent auth reviewer passed the attributed runtime matrix and verified the receipt/backing hashes; final exact-head CI and PR-only gates remain separate checks.

Before this integration, a597 Test CI passed all 17 jobs and its required gate. E2E attempt 2 passed 36 scenarios / 221 steps. Attempt 1's scroll sample failure is retained; the successful retry does not prove a historical scroll race fixed. New integration-head CI results are attached to the PR.

## Evidence format and limits

[evidence.jsonl](./evidence.jsonl) preserves each allowlisted original receipt as an exact UTF-8 string with its filename and SHA-256. This avoids altering immutable receipt hashes through JSON formatting. Parse a line, hash `utf8.encode('utf-8')`, and compare it with `sha256`; then parse the contained JSON when applicable. The original 24-receipt packet and supplementary native, backfill, integration and migration records are included. Private backing files themselves are omitted.

All owned application/stub processes were stopped, and the copied browser profile was preserved. Owned synthetic fixtures were removed; one unidentified canonical candidate CLI grant was preserved because exact ownership was unproven. Production cutover, old-writer drain, production raw-row state and deployment contents are separate release facts and are not claimed here.
