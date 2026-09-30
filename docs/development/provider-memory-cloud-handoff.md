# Provider and Memory cloud continuation

Baseline: `28dc3bbad36e4661f8d09154ff8b017cf5cadaeb`.
Execution: Linux `/workspace/orvilo1`, 2026-09-30. No Mac execution or source-file access.

## Provenance

This candidate contains **cloud reconstruction, pending comparison with the original draft**. It must not be described as a byte-for-byte restoration of the 76-file draft. The original draft was incomplete and unverified. The cloud implementation reuses surviving backend/store/UI primitives and adds missing behavior.

The four files under `tests/provider-memory-evaluation` were extracted from original part 10. Their Git blob prefixes at extraction (before repository formatting) matched that message: `137a3c52` (probe), `aad980cf` (corpus), `c1b817ab` (scorer), `35e6d9a7` (scorer tests). Five original model/schema/types files were separately archived and verified against their original blob prefixes; the whole 172453-character / 76-block patch has not been archived or verified as a single applicable patch. Subsequent changes, if any, should be recorded separately.

## Boundaries

Provider bindings are personal configuration records with personal credential references and revision CAS. Saving does not authorize runtime execution. A host-injected adapter references `@orvilo/agent-execution/controlPlane` and rechecks server authority, owner, credential and revision after checking. The default router has no host composition and fails explicitly. The canonical core package changes still need integration into this checkout; there is no successful-provider claim or replacement runtime.

Memory retains the old writer and legacy records. The new advisory experience surface reads legacy experiences directly alongside new SQL rows; it does not migrate authoritative task, lease, decision or verification state into Prime. Lexical ranking requires the exact pinned Prime revision `7d442aafa985f9342134fac16c2ef41f03fb45c1` and does not call an embedding or model service. Missing lexical configuration does not prevent listing saved records.

0196 and 0197 are forward Drizzle-generated proposals. Nothing here applies them to a production database. Existing migrations are retained.

## Evidence

Baseline environment checks passed: shared router 67 tests; credential model 15; API key scope 13; migration journal 14 (one PostgreSQL-only case skipped); disposable PGlite transaction rollback. These baseline checks do not establish the new feature behavior.

Cloud candidate checks completed during implementation:

- Memory session isolation: 38 tests across five files, including delayed reads/mutations and account replacement. The regression was observed failing before the fix.
- Provider model and actual router with a disposable PGlite database: twelve tests covering personal credential scope, cross-owner denial, deleted credentials, revision conflicts, concurrent writes, direct-model validation, default compatibility and API-key guards. Four tests exercise the injection adapter with explicit broker doubles; they do not prove the Core implementation or an external provider.
- Original recall scorer: three tests. These validate scoring, not Prime search quality or product integration.
- Combined final application run: 162 tests passed across 19 files, including real Memory routers, manual creation of all five legacy layers, workspace purge denial, the real Prime adapter, shared routes, settings, and account/cache isolation. Provider component cases in this run were subsequently replaced by six tests of the actual feedback hook to comply with repository rules; the hook and Provider store run passed all nine tests.
- Final combined database run: 32 passed across four files, one PostgreSQL-only case skipped (Provider, experience memory, generated migrations and journal). PGlite tests cover full baseline replay, failed upgrade rollback, reapply with old/new rows retained, and constraints.
- Pinned upstream probe: Chinese and English queries each returned the same-language experience; revoked and unrelated queries returned none. Cross-instance update/delete and deletion after reopening passed. Scoring the supplied bilingual labels gives recall 0.5, duplicate/false recall/missing all zero. This exposes the lack of cross-language semantic recall; it is not a production quality claim.
- The resource-limited TypeScript/Python adapter executed the real pinned source. Python is embedded in a portable TypeScript string, with a source parity test. A minimal Vite SSR build of this final representation was executed against it, confirming packaged use independent of source-directory paths.
- Memory actual-router authentication/ownership and lexical source tests: six passed across two files. Tests cover anonymous/workspace/restricted-key denial, foreign owner CRUD, strict authority-kind rejection, CAS and deletion during the real lexical subprocess. Only the database connection is redirected to disposable PGlite; router/model/permissions are real.

Full authenticated browser/product flows and real Provider connectivity have not been accepted. Test-controlled services in UI tests are boundary substitutes, not real backend delivery evidence. The scoped server TypeScript check timed out after 90 seconds without diagnostics. A subsequent package-scoped native TypeScript check completed with unresolved dependencies and existing-code diagnostics; it also confirmed the missing canonical Core module. A new test callback typing error was corrected. There is no passing typecheck claim. Core checkpoint `0b6c57c37045a654a45fe203f2f61e406b62a9b1` bundle, patch and manifest paths were checked in this environment and were absent; transfer and integration remain required. No production credentials, remote subscriptions, push, PR, merge or deployment have been used.
