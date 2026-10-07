# Description reference chips

## Scope and observable success

- Issue descriptions recognize safe GitHub PR URLs and same-app Issue URLs.
- A recognized link becomes a compact clickable status/icon/title chip.
- Ordinary custom links remain links. No arbitrary URL fetch is introduced.
- Save/reload retains typed reference identity in `editorData` JSON and markdown links.
- Editable, locked/read-only, routed and portal descriptions render the same node.
- Current viewer access controls metadata. Missing/unreadable references remain visible
  as an unavailable chip, without a saved private title or status.

## Existing owners and smallest implementation

- `TaskInstruction` already mounts `EditorCanvas` for editable and read-only descriptions.
- `@lobehub/editor` 4.29.1 already supplies persisted `SchemaNode` (`schema-link`),
  `ReactLinkPlugin.schemaRules`, renderers, normalization, and markdown serialization.
- Add description-only schema rules through the existing link plugin; no new node,
  dependency, editor, DB schema, server fetcher, route or global widget.
- `TaskDetailScope` owns a per-host description reference action provider. It never
  follows another host's global active-task ID.
- `pullRequestService.detail` uses the viewer's existing GitHub OAuth/ACL boundary;
  `taskService.find` uses the current user/workspace TaskModel boundary.
- Real editor regressions exposed two installed-library defects: deferred schema
  getters run outside Lexical read scope, and replacing selected link text loses
  the caret and rolls back insertion. A description-only adapter snapshots node
  data during decoration and moves the caret before reusing the installed normalizer.
- Imported full schema nodes (including toolbar/export URL and title) are validated
  and canonicalized; clipboard nodes use the same registered transform before commit.
- Explicit foreign-workspace URLs render unavailable before any active-scope lookup.

## Persisted contract

- `schemaType`: `orvilo-description-reference`.
- `payload`: `{ kind: 'pull-request' | 'issue', id: string, url: string }`.
- PR ID: existing `gh:github.com:<owner>:<repo>:<number>` contract.
- Issue ID: task ID or identifier from its recognized route.
- Node title is the supplied stable ID, not fetched private metadata.
- Runtime title, workflow/PR status and icon resolve anew for the viewer.
- Clipboard HTML / imported JSON is validated again before lookup or navigation.

## Recognition and permissions

- Reuse `safeWorkAttentionActionUrl` for forbidden schemes, credential userinfo,
  control characters, backslashes and protocol-relative rejection.
- PR host is exactly `github.com`, HTTPS, with valid repository/positive safe number.
- Issue path matches existing optional workspace and agent scopes plus `/task/:id/:slug?`.
- Absolute Issue URLs must match the current app origin; unrelated origins stay links.
- No persistence or insertion while permission/edit lock is blocked.
- Unavailable data never falls back to a saved preview title/status.
- Lookup/cache is partitioned by current user and existing workspace-aware SWR handling.

## Evidence and visual boundary

- User-provided Linear screenshot: description PR reference is a gray chip with
  status icon/title instead of a raw URL. Root collector owns live DOM/CSS evidence.
- Collector `/root/typescript_review` observed the PR chip live on 2026-10-06:
  inline `<a>`, body font 15px/450, line-height 24px; padding 1.5px 4.5px 1.5px 3px;
  border 0.5px, radius 4px; SVG 15×15; long title wraps naturally, without ellipsis.
  Dark background `lch(7.32 .85 272)`, border `lch(18.48 1.48 272)`,
  ink `lch(90.451 1.2 272)`; hovered background `lch(8.22 1.3 272)`.
  Map the surfaces/ink to Orvilo theme tokens. No shadow or separate status text.
  Heading chips inherit 17px/600 and scale padding with the text.
  Viewport 1645×889, DPR 2, dark; Issue-chip/mobile values remain unverified.
- Menu Add link/Add PR may be attachments; insertion is a separate reusable capability
  until the collector establishes their exact behavior.
- Interaction model: link recognition/insertion, click navigation; async metadata lookup.
- Loading and unavailable states are honest Orvilo states with no invented metadata.

## Plane provenance (concept only; no copied source)

- Public repository: `makeplane/plane`, revision
  `7466675e471efe1c96b122615f7a0d30c9b2eb05`, AGPL-3.0-only.
- [License](https://github.com/makeplane/plane/blob/7466675e471efe1c96b122615f7a0d30c9b2eb05/LICENSE.txt).
- [Mention payload](https://github.com/makeplane/plane/blob/7466675e471efe1c96b122615f7a0d30c9b2eb05/packages/editor/src/extensions/mentions/extension-config.ts).
- [Issue block](https://github.com/makeplane/plane/blob/7466675e471efe1c96b122615f7a0d30c9b2eb05/packages/editor/src/extensions/work-item-embed/extension-config.ts).
- [ACL search](https://github.com/makeplane/plane/blob/7466675e471efe1c96b122615f7a0d30c9b2eb05/apps/api/plane/app/views/search/base.py).
- Plane's enabled public mentions are users; no enabled public inline PR chip was found.
  Its issue block stores typed identity and delegates rendering. Adapt that concept
  independently into Orvilo's existing schema-link and authorized metadata APIs.

## Verification

- RED/GREEN parser: PR and scoped Issue recognition; ordinary/hostile links rejected.
- Resolver: real existing service metadata, caller ACL rejection, malformed payload
  does not call either service; no network fetch outside the existing services.
- Real editor: insert/normalize, stable JSON roundtrip, markdown export, read-only
  rendering; no fetched title/status in persisted payload.
- Scope actions: read-only/permission transition and separate routed/portal hosts.
- Scoped lint/tests only; full TypeScript is remote CI. Sole collector verifies real
  Electron save/readback and metadata-available/unavailable behavior at the revision.
- Builder check: 21 scoped files, clean lint, 91 tests passed. Independent reviewer
  closed both imported-node and workspace-scope findings in two review rounds.
- Electron mutation acceptance awaits the designated disposable description fixture;
  unit/rendered-editor evidence does not certify completed native acceptance.

## Failure conditions

- Raw URLs persist without conversion on the recognized path.
- JSON cannot reload, markdown loses the URL, or read-only rendering drops the chip.
- Metadata appears without an authorized read, or stale private snapshots render.
- Description/menu action targets a different mounted host or writes while blocked.
