# Draft card rich preview slice

Source: authenticated Linear Drafts at `https://linear.app/bdiverifier/drafts`, inspected again on 2026-09-22 in a dedicated Brave tab at 1729 × 889, light theme, English locale. The account had two private comment drafts. The earlier observations in `../COMPONENT_SPEC.md` were also checked. No reference record was changed.

## Observed reference behavior

- Each populated comment card shows an excerpt, relative time, a `Commenting on an issue` label, and a rich content preview that can include an issue link chip.
- The whole card opens the issue for editing, while its discard icon is a separate action.
- The observed cards were 468 × 139 px in a two-column grid.
- Current CDP measurement: first card link x=263, y=98.5, width=468.3, height=139; first title 13px/500; time 12px/450; preview document 13px/450. The card grid gap is 16px. The preview is a document region within a bordered panel under a 32px `Commenting on an issue` row.
- Clicking the first `Edit draft` link navigated to its issue path and showed the unsent content in the `Comment` editor. The URL had no `draft=1` query parameter in Linear. Private issue and draft text is intentionally omitted.

## Candidate source gap and implementation contract

- Before this slice, `TaskDraftsPage.tsx` opened the public task identifier and supported discard, but put `draft.content` in the title and a plain task identifier/name below it. Saved rich `editorData` was discarded from the card preview. The candidate had the title and body in the opposite roles from the observed reference.
- Render the stored editor document in a compact card preview when available. Keep the existing text-only fallback for older drafts, the card's edit destination, and the separate discard action.
- The stored editor format is `{version: 1, document, attachments}`; older rows can contain an unwrapped editor document. The preview must select the correct document without mutating saved data.
- The preview is visual context inside the card's single edit link. Its inner links must not take focus or intercept the card action.

## Verification

- Before the first implementation, `draftPreviewDocument.test.ts` failed because the rich-preview helper did not exist. Four focused cases then passed: wrapped document, legacy document, JSON string and missing document.
- Independent review found that `LexicalRenderer` lacked the task editor's custom node registrations. A new component-level regression with a real serialized `local-file-tag` node failed before the follow-up fix: Lexical reported `parseEditorState: type "local-file-tag" + not found` and the preview was empty. Reusing `RichTextMessage`, which registers the node family, made it pass.
- Scoped `bun run check` passed for the five task-owned source/test files: lint clean, 5 tests. It emitted one advisory about new component tests; the task's explicit requirement for a component-level regression takes precedence. Local `tsgo` was not run.
- In Electron, exercise a real synthetic saved draft, reload Drafts, inspect the rich preview, click the card, and verify restoration in the composer. Record URL, viewport and revision. The old one-card screenshot is not proof of this new preview.

Before the UI change, actual Electron `:9222` at `app://renderer/ws-useragenttes/drafts`, 1440 × 900, zh-CN, base revision `c5f45c9a329245a1f3a9474ed279bcd412ded535` plus other agents' unrelated uncommitted work, showed one new synthetic PTP-1 draft and sidebar count 1. Its card displayed the draft text as title and plain issue text as preview. Clicking its edit link opened `/ws-useragenttes/task/PTP-1/synthetic-issue-1-for-parity-fixture?draft=1` and restored the unsent synthetic text in the comment composer. The synthetic draft remains for post-change verification; no comment was submitted.

## Unknown

Fresh reference hover and narrow-viewport behavior, as well as destructive reference transitions, remain unverified.
