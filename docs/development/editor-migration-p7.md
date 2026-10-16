# P7: replacing `@lobehub/editor` with shadcn-editor

Steps 1 and 2 of the P7 plan in [`antd-retirement-plan.md`](./antd-retirement-plan.md): the
Lexical upgrade probe, and the node inventory with the legacy-document conversion. Call sites
are not migrated here.

Target: [shadcn-editor](https://github.com/htmujahid/shadcn-editor) (MIT) in its "Editor X"
form, on Lexical 0.52.0. Inventory taken from `@lobehub/editor` 4.29.2 (`es/`), the version
installed on this branch.

## Step 1: Lexical 0.52 coexistence

**Conclusion: yes.** `@lobehub/editor` 4.29.2 runs on Lexical 0.52.0, so both editors can
share one Lexical during the migration and pages can move one at a time. It needs these
changes, all in this branch:

| Change                                                                                                  | Why                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lexical` and every `@lexical/*` package `@lobehub/editor` depends on pinned to `0.52.0` in `overrides` | `@lobehub/editor` pins its `@lexical/*` dependencies exactly to `0.42.0`; overriding only `lexical` would install two Lexicals. The latest release, 5.0.0, still pins 0.42.                                                                                                                                |
| `allowBuilds: '@lobehub/editor': false`                                                                 | Its postinstall backports facebook/lexical#8347 into `@lexical/yjs` 0.42. Lexical 0.52 ships that fix (`sharedType.doc === null ? undefined : …` in `LexicalYjs.dev.js`), and the script crashes on the 0.52 package layout (entry moved to `dist/`), which fails `pnpm install`. Orvilo does not use Yjs. |
| `patches/@lobehub__editor@4.29.2.patch` (types only)                                                    | 0.52 brands `LexicalCommand<T>` as invariant, so `dispatchCommand<TCommand extends LexicalCommand<unknown>>` in six `.d.ts` files rejects every concrete command (35 type errors at our call sites). The patch widens the bound to `LexicalCommand<any>`, which is Lexical's own `AnyLexicalCommand`.      |
| `SerializedEditorState<SerializedLexicalNode>` → `SerializedEditorState`                                | The type is no longer generic in 0.52 (`headlessEditor.ts`, `pageAgent.ts`). `SerializedLexicalNode` was its default argument, so this is the same type on 0.42.                                                                                                                                           |

Evidence:

- **API scan.** All 227 named imports that `@lobehub/editor/es` takes from 12 Lexical modules
  resolve in 0.52. Method-level removals were checked by grep: `getCommonAncestor` (removed in
  #9238) is unused; `TableSelection.getShape()` and `CAN_UNDO_COMMAND` are deprecated but still
  exported.
- **Changelog** (v0.43–v0.52, `facebook/lexical` `CHANGELOG.md`). The breaking items that
  matter are ESM-only publishing (#9127), node classes moved to `$config()` (#8640; classic
  `static getType/clone/importJSON` subclasses still work) and the command brand above. None
  changes the serialized JSON of the nodes we store.
- **Tests.** Results match the untouched 0.42 baseline exactly, run on the same tree:

  | Suite                                                                                                                  | 0.42                                   | 0.52                                   |
  | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------- |
  | `packages/editor-runtime` (incl. `EditorRuntime.real.test.ts`)                                                         | 29 pass, 20 fail                       | 29 pass, the same 20 fail              |
  | `src/features/{ChatInput,EditorCanvas,PageEditor,EditorModal,AgentTasks,TaskDrafts}`, `src/store/document` (212 files) | 1788 pass, 2 timeouts + 1 hook timeout | 1787 pass, 3 timeouts + 1 hook timeout |
  | `apps/server/src/services/agentDocuments` (real headless editor, no mocks) + `serverRuntimes/agentDocuments.test.ts`   | n/a                                    | 58 pass                                |
  | `packages/builtin-tool-page-agent`                                                                                     | n/a                                    | 27 pass                                |

  The 20 `editor-runtime` failures are older snapshot drift against `@lobehub/editor` 4.29.2
  (Markdown export no longer ends paragraphs with a trailing space; LiteXML ids are no longer
  key-derived). They fail identically on 0.42. The timeouts are in
  `HeteroDeviceSwitcher.lifecycle.test.tsx` and `TaskAcceptance.test.tsx`, which import no editor
  code; both files pass in isolation (42/42).

- **Type-check.** Root `tsc --noEmit` on 0.52 before the patch: 39 Lexical errors (35 command
  bounds, 4 `SerializedEditorState` generics). After it: none; the only remaining error is in
  `src/features/Recommendations/actions/heteroAgent.ts` (avatar component typing, no Lexical).
- **Remaining risk.** Upstream does not test `@lobehub/editor` against 0.52, and the tests above
  do not drive a browser. Smoke-test the page editor, chat input (mention, slash menu, send) and
  task comments in the Electron app before merging the bump.

## Step 2: node inventory

### Nodes `@lobehub/editor` registers

Custom nodes, from `static getType()` in `es/plugins/*/node`:

| `getType()`                              | Class (plugin)                            | Kind                                              | Serialized fields beyond the Lexical base                             |
| ---------------------------------------- | ----------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------- |
| `link`                                   | `LinkNode` (link)                         | inline element, replaces `@lexical/link`          | `url`, `rel`, `target`, `title`                                       |
| `autolink`                               | `AutoLinkNode` (link)                     | inline element                                    | link fields + `isUnlinked`                                            |
| `link-card`                              | `LinkCardNode` (link)                     | inline decorator                                  | `url`, `title`, `description`, `icon`, `openTarget`                   |
| `link-block-card`                        | `LinkBlockCardNode` (link)                | block decorator                                   | as `link-card`                                                        |
| `link-iframe`                            | `LinkIframeNode` (link)                   | block decorator                                   | `url`, `src`, `title`                                                 |
| `schema-link`                            | `SchemaNode` (link)                       | inline decorator                                  | `url`, `title`, `schemaType`, `payload`                               |
| `linkHighlight`                          | `LinkHighlightNode` (link-highlight)      | inline element; URL is its text                   | none                                                                  |
| `mention`                                | `MentionNode` (mention)                   | inline decorator                                  | `label`, `metadata`                                                   |
| `codeInline`                             | `CodeNode` (code)                         | inline element (card-like)                        | none; children are text + `cursor`                                    |
| `code`                                   | `CodeMirrorNode` (codemirror-block)       | block decorator                                   | `code`, `language`, `codeTheme`, `options`                            |
| `code` / `code-highlight`                | `@lexical/code-core` (codeblock)          | block element                                     | `language` (element form, has `children`)                             |
| `math` / `mathBlock`                     | `MathInlineNode` / `MathBlockNode` (math) | inline / block decorator                          | `code`                                                                |
| `image`                                  | `ImageNode` (image)                       | inline decorator                                  | `src`, `altText`, `width`, `height` (0 = auto), `maxWidth`, `status`  |
| `block-image`                            | `BlockImageNode` (image)                  | block decorator                                   | as `image`                                                            |
| `file`                                   | `FileNode` (file)                         | inline decorator                                  | `fileUrl`, `name`, `size`, `status`, `message`                        |
| `horizontalrule`                         | `HorizontalRuleNode` (hr)                 | block decorator                                   | none                                                                  |
| `collapsible`                            | `CollapsibleNode` (collapsible)           | block element; first child is the title paragraph | `collapsed`, `title`                                                  |
| `cursor`                                 | `CursorNode` (common)                     | text node holding `U+FEFF`                        | none                                                                  |
| `PlaceholderInline` / `PlaceholderBlock` | auto-complete                             | ghost suggestion elements                         | none                                                                  |
| `diff`                                   | `DiffNode` (litexml)                      | block element: `[original, modified]`             | `diffType`: add, remove, modify, unchanged, listItemAdd/Remove/Modify |
| `diff-content`                           | `DiffContentNode` (litexml)               | one side of a multi-block `diff`                  | `side`                                                                |
| `table-row-diff` / `table-cell-diff`     | `TableRowDiffNode` / `TableCellDiffNode`  | `tablerow` / `tablecell` subclasses               | `diffType`, `changeId`                                                |

Lexical nodes it registers unchanged: `root`, `paragraph`, `text`, `linebreak`, `tab`, `heading`,
`quote` (common), `list`, `listitem` (list), `table`, `tablerow`, `tablecell` (table).

Every node also carries a LobeHub node identity, written twice: NodeState `$.properties.nodeId`
and a legacy top-level `id`. Only LiteXML reads it.

Orvilo's own nodes, registered by `src/features/ChatInput/InputEditor`: `refer-topic`
(`topicId`, `topicTitle`), `action-tag` (`actionType`, `actionCategory`, `actionLabel`) and
`local-file-tag` (`name`, `path`, `isDirectory`). They are Orvilo code, not LobeHub code, and
move to the new editor unchanged.

### What each surface enables

| Surface                                                                                        | Plugins (nodes)                                                                                                                           |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Every `Editor`                                                                                 | common (heading, quote, cursor), markdown                                                                                                 |
| ChatInput (`InputEditor/plugins.ts`)                                                           | list, code (`codeInline`), codemirror (`code`), hr, link-highlight, virtual-block, math, mention, action-tag, refer-topic, local-file-tag |
| EditorCanvas (`InternalEditor.tsx`): PageEditor, AgentTasks, TaskDrafts, DocumentModal, Portal | litexml (diff nodes), the ChatInput set with link instead of link-highlight, mention, table, image, file (`LinearFilePlugin`), toolbar    |
| PageEditor (`PageEditor/EditorCanvas`)                                                         | EditorCanvas + block (drag handles)                                                                                                       |
| EditorModal                                                                                    | link, table                                                                                                                               |
| Projects (`ProjectDescription`, `ProjectUpdateEditor`)                                         | link, list                                                                                                                                |
| `CreatePlan` / `CreateGoal` interventions                                                      | code, codeblock (`@lexical/code-core` `code`), hr, link, list, math (CreatePlan), table                                                   |
| Server headless (`headlessEditor.ts`, `pageAgent.ts`, `packages/editor-runtime`)               | `createHeadlessEditor` default set, including litexml and collapsible                                                                     |

Not reachable from Orvilo surfaces, but handled because stored or pasted data can contain them:
`collapsible`, `link-card`, `link-block-card`, `link-iframe`, `schema-link`, the placeholders.

## How documents are stored

Rich text is stored as Lexical JSON in `jsonb editor_data`, next to a `text content` column
holding the Markdown (or plain-text) export. The server's headless editor hydrates
`editor_data` and falls back to `content` when it is missing or invalid.

| Table                                                        | Columns                             |
| ------------------------------------------------------------ | ----------------------------------- |
| `documents` (pages, agent documents)                         | `editor_data`, `content`            |
| `document_histories`                                         | `editor_data` (NOT NULL, snapshots) |
| `document_comments`, `topic_comments`, `acceptance_comments` | `editor_data`, `content`            |
| `tasks` (description), `task_description_histories`          | `editor_data`                       |
| `task_comments`, `task_comment_drafts`                       | `editor_data`, `content`            |
| `messages`, `message_groups`, `topics`, `threads`            | `editor_data`, `content`            |
| `agents`, `agent_skills`, `chat_groups`                      | `editor_data`                       |

Code that reads node types out of stored JSON, and must follow the new names when it moves:

- `src/libs/editor/normalizeDiffNodes.ts`, used on save by `apps/server/src/services/document`
  and `src/services/documentHistoryQueue.ts`. It handles block diffs only; it leaves
  `table-*-diff` nodes, and for `listItemAdd` it keeps an empty list item where the editor
  removes the item. `convertLegacyEditorState` supersedes it.
- `EditorCanvas/editorAttachments.ts`, `AgentTasks/AgentTaskDetail/draftEditorData.ts`,
  `AgentSkillDetail`: look for `file`, `image` and `block-image` and their `status`.
- `store/chat/.../parseCommands.ts` (`mention` `label` + `metadata`) and
  `streamingExecutor.ts` (`refer-topic`).

### Convert on load, not a DB migration

Recommendation: **convert lazily at load, write the new shape on the next save, then backfill**.

- A Drizzle SQL migration cannot run the conversion: diff rejection, collapsible restructuring
  and table width fixes need code. A rewrite has to be an application job either way.
- 16 tables hold the data, and `document_histories` is append-only. One pass would be large,
  with nothing to gain until every reader uses the new editor.
- Desktop clients update on their own schedule. An old client can still write LobeHub JSON
  after a one-shot migration has run, so the load path needs the converter regardless.
- The converter is pure, fast and idempotent, so applying it on every load is cheap, and the
  `content` column remains a fallback.

The plan says to migrate stored documents once before the new editor ships. Lazy conversion
replaces that. The one-off pass still happens, as an idempotent batched backfill script that
uses `report` for counts. It runs after the last `@lobehub/editor` writer is gone, before the
converter is deleted.

The reverse direction is a risk: an old client opening a document saved by the new editor
meets unknown node types. Gate it with a minimum desktop version, or have the old editor
fall back to `content`, before the first page switches.

## Conversion rules

`convertLegacyEditorState(json)` in
[`src/libs/editor-migration/convertLegacyEditorState.ts`](../../src/libs/editor-migration/convertLegacyEditorState.ts).
It is pure and idempotent, accepts an object or a JSON string, and returns
`{ changed, editorState, report }`. `report` counts converted, degraded and dropped nodes by
source type, plus rejected diffs. The function does not mutate its input.

| Legacy node                                                                                                                                                   | Rule    | Result                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| root, paragraph, text, linebreak, tab, heading, quote, list, listitem, table, tablerow, tablecell, horizontalrule, `@lexical/code-core` code / code-highlight | keep    | unchanged                                                                                                                             |
| link, autolink                                                                                                                                                | keep    | unchanged; same fields as `@lexical/link`                                                                                             |
| refer-topic, action-tag, local-file-tag                                                                                                                       | keep    | unchanged; Orvilo ports these nodes to the new editor                                                                                 |
| node identity (`id`, `$.properties`)                                                                                                                          | drop    | removed from every node; other NodeState keys are kept                                                                                |
| mention                                                                                                                                                       | map     | shadcn `mention` TextNode: `text` and `mentionName` = `label`, `mode: segmented`; `metadata` kept (the ported node must serialize it) |
| codeInline                                                                                                                                                    | map     | its text children with the code format bit (16)                                                                                       |
| code (CodeMirror decorator)                                                                                                                                   | map     | `@lexical/code-core` `code` element: one text node per line, `linebreak` between, `language` kept                                     |
| math / mathBlock                                                                                                                                              | map     | `equation` with `inline: true` / `false`                                                                                              |
| image                                                                                                                                                         | map     | `image` with `src`, `altText`, `maxWidth`; `width`/`height` only when > 0; `status` dropped                                           |
| block-image                                                                                                                                                   | map     | `image` in its own paragraph (the target image is inline)                                                                             |
| image without a durable `src` (empty, `blob:`)                                                                                                                | degrade | `altText` as text, or dropped when empty                                                                                              |
| collapsible                                                                                                                                                   | map     | `collapsible-container` (`open` = `!collapsed`) > `collapsible-title` (first paragraph, else `title`) + `collapsible-content`         |
| linkHighlight                                                                                                                                                 | map     | `link` with LobeHub's URL normalization (`www.x` → `https://www.x`, emails → `mailto:`)                                               |
| link-card, link-block-card, link-iframe                                                                                                                       | degrade | `link` labelled with `title`; block ones in their own paragraph                                                                       |
| schema-link                                                                                                                                                   | degrade | `link` when the URL is http(s)/mailto/tel/sms, otherwise its title as text (Lexical sanitizes other schemes)                          |
| file                                                                                                                                                          | degrade | `link` to `fileUrl` labelled `name` (`target: _blank`), or the name as text                                                           |
| cursor, PlaceholderInline, PlaceholderBlock                                                                                                                   | drop    | removed (editing artefacts, no stored text)                                                                                           |
| diff `modify` / `remove`                                                                                                                                      | reject  | the original side (first child; a `diff-content` side contributes all its blocks)                                                     |
| diff `add`, `listItemAdd`                                                                                                                                     | reject  | removed; `listItemAdd` removes the whole list item, as `DiffAction.Reject` does                                                       |
| diff `unchanged`, `listItemRemove`                                                                                                                            | reject  | children kept in place                                                                                                                |
| diff `listItemModify`                                                                                                                                         | reject  | the original item's inline children                                                                                                   |
| table-row-diff                                                                                                                                                | reject  | `add` rows removed; `remove` rows become plain `tablerow`                                                                             |
| table-cell-diff                                                                                                                                               | reject  | `add` cells removed; `remove` cells become plain `tablecell`; `colWidths` loses a column only when every row lost that cell           |
| any other type                                                                                                                                                | degrade | children kept (wrapped in a paragraph at block level), or its `text`/`title`/`label`/`name` as text                                   |

After mapping, block containers (`root`, `tablecell`, `collapsible-content`) get stray inline
runs wrapped in paragraphs, and inline containers get paragraphs from degraded or rejected
blocks unwrapped. An empty document gets one empty paragraph.

Fixtures: `src/libs/editor-migration/__fixtures__/*.json` were exported by `@lobehub/editor`
4.29.2's headless editor (`hydrateMarkdown` / `hydrateEditorData`, then `export().editorData`).
They carry its exact field sets, including both node identity forms. Shapes the default
headless set cannot produce (the link-card family, list and table diffs, chat decorators) are
built in the test from each node's `exportJSON`.

### Open decisions

- **File attachments.** Editor X has no file node. Degrading `file` to a link keeps the name
  and URL, but loses the attachment card, upload state and click-to-open
  (`registerAttachmentClickOpen`, `editorAttachments.ts`). Task comments use it. If the card
  stays, port a small Orvilo `file` node the way the chat decorators are ported, and change
  that row to "keep".
- **Mention metadata.** shadcn-editor's `MentionNode` serializes only `mentionName`. Chat
  commands need `metadata` (`parseCommands.ts`), so the vendored node must add it.
- **Image `status`.** `editorAttachments.ts` treats an image without `status: 'uploaded'` as
  incomplete. It must accept converted images, which have no `status`.

## Remaining P7 work, as PRs (target `canary`)

1. **Lexical 0.52** (this branch, first commit). Overrides, postinstall off, type-only editor
   patch, `SerializedEditorState` fix. Needs the Electron smoke test above.
2. **Converter** (this branch, second commit). `convertLegacyEditorState` and this doc. Not
   wired in yet.
3. **Vendor shadcn-editor.** `npx shadcn add @shadcn-editor/editor-x` into a repo-owned folder
   with only the extensions we use. Add `metadata` to `MentionNode`, port `refer-topic`,
   `action-tag`, `local-file-tag` (and `file`, if kept) to `$config()`, theme from the semantic
   tokens, and add the remaining `@lexical/*` 0.52 dependencies. Add a test that loads the
   converted fixtures into a real Lexical 0.52 editor with these nodes. No call sites yet.
4. **ChatInput.** `chat-input-plugin`, `mention-plugin`, `component-picker`, Markdown
   shortcuts; existing `prompt-input` action bar, hotkeys, attachments. Update
   `parseCommands.ts` and `streamingExecutor.ts` for the new mention shape.
5. **Load boundary.** Run `convertLegacyEditorState` wherever stored `editor_data` reaches the
   new editor (client load helpers, server headless hydrate), and replace
   `normalizeEditorDataDiffNodes` with it. Update `editorAttachments.ts` and
   `draftEditorData.ts`. Ships with or before the first document surface.
6. **Document surfaces**, one PR each: Projects and EditorModal (small plugin sets) first, then
   AgentTasks/TaskDrafts comments, then PageEditor (toolbar, floating toolbar, drag handles,
   tables). `LexicalRenderer` read-only rendering moves with its surface.
7. **AI document edits.** Drop LiteXML and diff review. `getPageContent` returns Markdown;
   `modifyNodes` is removed in favour of `replaceText` or whole-Markdown writes.
   `packages/editor-runtime` and the server headless editor move to `@lexical/headless` with the
   shared transformers. Fixes the 20 stale `editor-runtime` snapshots by rewriting those tests.
8. **Backfill.** A batched, idempotent conversion script over the 16 tables, run once nothing
   writes LobeHub JSON.
9. **Charts and icons**, then **remove dependencies**: `@lobehub/editor`, its patch and
   `allowBuilds` entry, `@lobehub/charts`, `antd`, `antd-style`, `@ant-design/cssinjs`,
   `@lobehub/ui`, `LobeThemeScope`, the editor alias table; delete the converter after the
   backfill.
