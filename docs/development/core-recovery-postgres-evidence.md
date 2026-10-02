# PostgreSQL receipt and snapshot recovery acceptance

2026-09-30, Linux cloud workspace `/workspace/orvilo1`. The final opt-in suite
`apps/server/src/services/controlPlane/receiptRecovery.postgres.test.ts` passed
**9/9**, exit 0, at 17:59:04 UTC in 6.07 seconds. Repository scoped lint passed.

## Dedicated persistent database

Only the newly created labelled container `orvilo-core-recovery-20260930` was
restarted. It uses a same-named persistent Docker volume at `/var/lib/postgresql`,
PostgreSQL 18.6 from immutable image
`sha256:545120602ea0cefb0992449b40b99e7ff88f784a339f5194b86b609a2517f722`,
and fixed loopback port `127.0.0.1:32772`. Database `core_recovery` and its credentials
are disposable fixtures. The test validates loopback scope and container label
before permitting restart. No pre-existing database containers were altered.

Full repository migrations were applied, then candidate receipt/snapshot/control
DDL explicitly. No production migration, subscription, credential or deployment
was created. The test observes a changed `pg_postmaster_start_time()` after restart.
The persistent volume survives the actual database process restart.

```sh
CORE_RECOVERY_DATABASE_URL=postgresql://postgres:core_recovery_fixture_only@127.0.0.1:32772/core_recovery \
  node node_modules/vitest/vitest.mjs run \
  apps/server/src/services/controlPlane/receiptRecovery.postgres.test.ts --silent=passed-only
```

## Receipt recovery

The production gateway, SQL receipt store, canonical database admission, scoped
file writer and read-only verifier are used. The test injects an acknowledgement
loss after an actual file write and interrupts progress persistence, leaving the
original durable receipt **prepared**. The original file capability is closed and
drained before reconciliation. This proves that local capability's closure;
no runtime tree was launched, and the test does not claim OS quiescence evidence.

After the database restarts, reconciliation claims recovery ownership and pauses
inside the read-only verifier **before** finishing recovery. The test checks SQL
still contains the prepared status, then attempts the original owner's otherwise
legal prepared-to-applied callback. It is rejected by ownership fencing; the denial
cannot be explained by the terminal-status guard. Releasing the verifier produces
a verified receipt with the same identity. Apply count remains one and file inode
and contents remain unchanged. Repeated recovery is idempotent. A canonical policy
revision change denies recovery without accepting the old authority snapshot.

## Authoritative snapshot recovery

The real snapshot service and `CanonicalCoreRuntimeHost` methods operate against
canonical frozen Verify-plan fixtures and private receipt files. No runtime start
is performed; the artifact verifier throws if launch is attempted.

A host captures a snapshot with a pending receipt, closes, the PostgreSQL server
restarts, and a newly opened host revalidates the saved snapshot. Inspection marks
execution resume unsupported; pending receipts return `outcome_unknown`. Advancing
a receipt invalidates the old snapshot but does not rewrite it. A newly captured
verified snapshot still returns `unsupported_capability` for ACP execution resume.
Thus metadata recovery does not manufacture Prime session restoration.

Other cases reject changed history hash, decision data, dependency graph, soft
deletion, missing criterion mappings, and missing or unknown persisted schema
versions. Tests distinguish database authority fixtures from actual provider or
runtime execution. Unverified/ambiguous effects remain explicit rather than being
replayed automatically.

After acceptance, the test-owned container and its labelled persistent fixture volume
were removed. The earlier checkpoint artifacts and source commits were retained.

After that successful run, full graph typing identified two fixture-only corrections:
Verify status `pending` became canonical `planned`, and decision detail `reason`
became canonical `comment`. Commit `3e7b9f0d` changes only those two lines. Production
code and assertions are unchanged; snapshot capture observes/hashes either value
without treating it as authorization. Lint and the final compiler comparison cover
the corrected fixture. The cleaned PostgreSQL suite was not repeated solely for
these corrections; the 9/9 execution evidence applies to its pre-correction fixture.
