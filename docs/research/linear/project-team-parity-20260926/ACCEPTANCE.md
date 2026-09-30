# PR #285 release acceptance

This record covers the Team Home resource and team Page behavior delivered by
`fix/linear-project-parity`. It contains local predeployment evidence only. No
production migration or deployment was performed during these checks.

## Source revisions

- `4bc693210`: Team resources, team Page access control, and migration `0193`
  implementation used by the first Electron pass.
- `29edea027`: source revision used for the isolated PostgreSQL migration,
  authorization, tRPC, and search-path acceptance runs.
- `0e728d3a5`: creator-account deletion fix that transfers retained team Page
  documents, Page histories, and document-backed Works to the surviving
  workspace primary owner.
- `db71f131b`: final tested revision. It includes the resource-row refresh after
  Page deletion and the ownership fix above.

The two commits after `29edea027` do not change migration `0193`, the team Page
ACL, the team resource router, or search hydration.

## Migration `0192` to `0193`

Migration `0193_team_resources_and_documents.sql` was replayed against an
isolated PostgreSQL 17 database at the `0192` journal boundary. The database
contained 100,000 synthetic document rows, approximately 33.3 MiB before the
migration.

- First application completed in 146 ms.
- Re-running the migrator completed as a 38 ms no-op.
- All 100,000 document rows remained present.
- All six new indexes reported valid and ready.
- Four audited foreign-key constraints reported validated.
- The journal contained exactly one `0193` entry.

The sanitized result transcript is in
[`evidence/release-gate-results-db71f131b.txt`](./evidence/release-gate-results-db71f131b.txt).

## Authorization and search

- Real PostgreSQL team Page ACL integration: 9 passed.
- Team resource tRPC integration: 5 passed.
- Elasticsearch candidate hydration authorization: 1 passed. Candidate hits
  were deterministic test inputs; the live Page rows and membership checks came
  from PostgreSQL. This does not claim a connection to an Elasticsearch cluster.
- The active production search backend is `pg_search`; production has no
  Elasticsearch URL, namespace, API key, or sync process configured.

The exercised ACL covers private-team member reads and edits, outsider denial,
comment/history/like access, Recent and Work visibility, and immediate
revocation after membership removal. The tRPC suite covers Page deletion by a
team lead, persistent resource operations, unsafe attachment rejection,
public-team reads with team-scoped writes, and workspace isolation.

## Electron Page lifecycle

Electron acceptance used the seeded local workspace and the final source
revision `db71f131b`.

1. A team Page title and body were edited through the Page modal.
2. The Page was reloaded and reopened; both values persisted and the modal
   reported that the latest version was loaded.
3. The Page was deleted through the Page menu and confirmation dialog.
4. The modal closed, the Team Resources row disappeared without a page reload,
   the empty state rendered, and the success toast appeared.

[Persisted title/body after reload and reopen](./evidence/electron-team-page-reload-db71f131b.png)

[Team Resources immediately after confirmed Page deletion](./evidence/electron-team-page-deleted-db71f131b.png)

The runtime fixture was removed at the end of the flow.

## Creator-account deletion regression

At `db71f131b`, the focused database model file passed 75 of 75 tests. The new
regression deletes a non-owner Page creator and directly asserts that:

- the team Page remains and is readable by the surviving workspace owner;
- Page history remains and is transferred to that owner;
- the document-backed Work remains and is transferred to that owner; and
- its immutable WorkVersion remains linked to the retained Work.

The full scoped repository check for `user.ts` and `user.test.ts` also passed:
two files lint-clean and the same 75 tests green. `git diff --check` was clean.

An independent final read-only review at exact revision `db71f131b` confirmed
that the transaction now updates histories, Works, and documents in dependency
order before deleting the creator. It found no remaining P0, P1, or P2 issue in
this lifecycle and marked the prior Page-history cascade finding resolved.

## Earlier parity evidence

- Favorites were reordered through a real pointer drag. Releasing the pointer
  did not navigate away, and the restored order persisted after reload.
  [Drag result](./parity-favorites-drag-final.png) ·
  [Reload result](./parity-favorites-persisted-final.png)
- A Team Home link was created, persisted after reload, and removed through its
  action menu and confirmation. The link was absent afterward.
  [After removal](./parity-remove-after-confirm.png)
- The Linear Import wizard showed its four-step layout and populated destination
  and source-team pickers. [Initial step](./parity-linear-import-step1.png) ·
  [Team picker](./parity-linear-import-team-picker.png)
- The original local importer run stopped at missing Linear OAuth configuration.
  That historical state is preserved for traceability.
  [Historical blocker](./parity-linear-import-oauth-blocker.png)

Configured Linear OAuth and full multi-page import acceptance are recorded in
the importer PR stack. They are outside this Team Page evidence packet.
