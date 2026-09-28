# Drafts rich preview verification — 2026-09-22

Source state: the before capture started at revision `c5f45c9a329245a1f3a9474ed279bcd412ded535`. Parallel agents advanced the shared branch during this session; the after screenshot was captured at 18:27:39 EDT, after the latest reflog entry at 18:26:59 for `bd80bc23dbe97ee80d486668fe8ee71ff23110df`. The Drafts diff remained uncommitted throughout, alongside unrelated agents' working-tree changes. This agent made no commit or push.

## Reference

Authenticated Linear, `https://linear.app/bdiverifier/drafts`, dedicated Brave tab, 1729 × 889, light theme, English locale, two existing private comment drafts. CDP measured the first card at x=263, y=98.5, 468.3 × 139 px. Its title used 13px/500 text; the bordered preview's `Draft content` document used 13px/450. Clicking `Edit draft` navigated to the issue and left the unsent content in its `Comment` editor. The reference data was not changed. Private text and screenshot were not copied into the repository.

## Candidate before the change

Actual Electron renderer at `app://renderer/ws-useragenttes/drafts`, CDP `:9222`, 1440 × 900 CSS pixels, DPR 2, zh-CN, local workspace `ws-useragenttes`. On the synthetic task `PTP-1`, an unsent comment with unique text `Synthetic Drafts rich preview 2026-09-22` was entered through the real comment editor. Autosave created one draft and sidebar count 1. The old card showed that comment as its title and the issue identifier/name as plain body text. Its edit link opened the public identifier URL with `?draft=1` and restored the comment in the composer. No comment was sent.

## Candidate after the change

The same real saved draft remained available after a reload at `app://renderer/ws-useragenttes/drafts`. CDP at 1440 × 900, DPR 2 measured one card at x=263, y=135.4, width=468, height=144.4. The card title was the synthetic issue name, and the preview displayed the saved rich editor document's comment text under the `Commenting on an issue` label. The whole-card edit link pointed to `/ws-useragenttes/task/PTP-1/synthetic-issue-1-for-parity-fixture?draft=1`; a physical card click opened that URL, and the comment composer restored the exact unsent text after its async load. The sidebar count stayed 1. The local screenshot is `/tmp/orvilo-drafts-rich-preview-2026-09-22.png` and was visually inspected, but it is not a durable PR artifact.

The local discard icon physically opened a confirmation dialog naming the draft-removal consequence. The tool's automatic approval review **rejected the final confirmation click**, stating that permanent deletion of the draft lacked explicit user confirmation, even though it was synthetic. No indirect deletion was attempted. The one synthetic draft still exists in `ws-useragenttes`; the shared Electron renderer was returned to `app://renderer/ws-useragenttes/projects` and released. Empty-state and count-after-discard verification therefore remain pending.

After the custom-node renderer fix, a second read-only Electron check at 18:46 EDT ran against HEAD `0092dad3e921248afe26e3f28b1489fca8342ebf` plus the uncommitted Drafts diff. At `app://renderer/ws-useragenttes/drafts`, 1440 × 900 CSS pixels, DPR 2, the retained synthetic card rendered one rich paragraph containing its full unsent text; the edit URL still ended in `?draft=1`, and the sidebar count remained 1. The page was restored to `/ws-useragenttes/projects`. This existing draft contains only a plain paragraph; custom-node rendering is proven by the red/green component regression, not by this Electron check. The draft was not deleted or sent.

## Automated checks and remaining parity

The first regression failed before implementation because `draftPreviewDocument` did not exist. Independent review then identified a current custom-node failure in the preview renderer. A component-level test with a serialized `local-file-tag` reproduced `parseEditorState: type "local-file-tag" + not found` and an empty preview. `DraftContentPreview` now delegates rich documents to the existing `RichTextMessage` renderer, which registers `action-tag`, `refer-topic`, and `local-file-tag`. The follow-up scoped `bun run check` on five task-owned source/test files passed: lint clean, five tests. The checker emitted its general advisory against new component tests; this test fulfills the explicit component-level regression requirement for the observed failure. Local `tsgo` was not run.

The card's vertical position and height still differ from the measured reference. The retained synthetic draft has plain paragraph content, so rich issue chips and attachment rendering were not directly exercised in Electron; the custom-node regression is component-level evidence. Reference mobile/dark, hover, empty and destructive transitions remain unverified. The worktree contains unrelated agents' changes; this record covers only the Drafts slice.
