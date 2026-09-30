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

## Continued cloud verification after checkpoint 30626c3c

Exact differential type checking used base `28dc3bbad36e4661f8d09154ff8b017cf5cadaeb` and candidate `30626c3cf1910cd314f36915baddc7a7e9245274`, identical installed compiler/dependencies and identical generated Next declarations. An audit of 13,714 dependency symlinks found none in the isolated baseline resolving into candidate sources. The completed root check passed at baseline (zero diagnostics); candidate reported six diagnostics: the missing canonical Core module and five Memory diagnostics. Earlier timed-out/resource-aborted attempts are retained separately and are not results. The scoped server comparison was 280 baseline diagnostics versus 281 candidate diagnostics, with only the Core import added.

The five Memory diagnostics were traced to a sparse subprocess environment conflicting with application ambient environment types, activity list fields being mistaken for full detail, and generic inference in a session-isolation test. Fixes preserve the subprocess environment allowlist and fetch the actual activity detail before editing. The activity list response omits both narrative and summary, so the list renders its title without inventing a body preview. Follow-up verification is recorded with the final artifact manifest.

The normal Linux application database was initialized through migrations 0000–0197 against isolated PostgreSQL, with dedicated Redis and fixture users. The normal authentication endpoint returned the expected fixture user using the real session model. Normal application browser acceptance is tracked separately from the supporting feature host; successful authentication alone does not establish that the SPA rendered.

Supporting browser evidence uses the actual Provider feature, stores, services, tRPC routers and PostgreSQL. Only outer navigation and login selection are fixture adapters. The browser created a configuration, reloaded it, edited it, observed the unavailable broker response, switched accounts without showing the other account's row, cancelled deletion, confirmed deletion and reloaded the empty list. The API returned create/update/delete success and connection-check HTTP 412; no ready response was simulated. These screenshots and network summaries establish feature/API integration, not normal application-shell acceptance or external provider connectivity.

Core checkpoint `0b6c57c37045a654a45fe203f2f61e406b62a9b1` bundle, patch and manifest paths were checked in this environment and were absent. Transfer, host composition and integrated type verification remain required. No production credentials, remote subscriptions, push, PR, merge or deployment have been used.

Normal full-shell browser attempts returned HTTP 200 HTML but did not reach the Provider page. Screenshots show only the Orvilo loader. Profiling identified repeated work in the developer click-to-source inspector; disabling that inspector in scratch configuration restored HTML delivery. The scratch no-discovery dependency optimizer then missed CommonJS exports (`use-sync-external-store/shim`, followed by `dayjs/plugin/isToday`). These are preserved failed environment attempts, with no Provider API or full-shell success claimed. Restoring normal dependency discovery while retaining the inspector-only exclusion is the next full-shell configuration to verify.

The supporting Memory browser run uncovered a real blank-document editor crash: the installed Markdown loader produces a root with no children for empty content, which Lexical rejects. `EditorModal/EditorCanvas` now initializes blank documents through the existing text loader, retaining Markdown for nonempty content and JSON for saved editor state. Before-fix browser errors and after-fix create/reload/edit evidence are preserved. The run exercised Prime CRUD, English/Chinese search with actual server responses, account A/B isolation, all five legacy layers, legacy experience dual-read/deletion, and injected transport failure followed by successful retry. Screenshot review found some initial detail/deletion captures occurred before their final render. A second completed run waits for actual detail content, closed confirmation dialogs, empty lists and settled home/search states; all 33 final screenshots were inspected. Initial provisional captures remain archived separately. The final Provider recapture also includes the visible unavailable-connection message, with create/reload/edit/account-switch/delete completed against real APIs.

Incremental tests after these fixes: 17 activity-edit/session regressions and two real pinned lexical/source parity tests passed. Increment lint was clean across ten files (one locale line wrap only). Browser captures were made against checkpoint30626c3c plus the recorded incremental source diff; final commit and artifact hashes are recorded in the manifest.

Post-browser read-only PostgreSQL audit for the two isolated fixture users found zero Provider rows, zero active Prime rows, three deleted Prime tombstones with empty content, and zero remaining records in each of the five legacy layers. Only aggregates were read; credential payloads were not queried.

Final completed full-root comparison: baseline exit 0 with zero diagnostics; corrected candidate exit 1 with exactly one diagnostic, `TS2307` for the absent `@orvilo/agent-execution/controlPlane` export in `services/providerBinding/configuration.ts`. All Memory diagnostics are resolved. Identical generated declarations were verified again; only documentation changed during this run. This is not an integrated typecheck pass until the Core checkpoint is transferred.
