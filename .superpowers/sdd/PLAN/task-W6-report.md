# Task W6 — Narrow/peek crowding + cleanup — report

Branch: `feat/linear-issue-detail-parity` · worktree `.claude/worktrees/linear-issue-detail`

## A. Narrow/peek header crowding — VERIFIED, no change

Verified statically against the shipped layout, no concrete breakage found:

- `TaskDetailHeaderActions.tsx:624-663` — the cluster is `[2-3 copy icons
  hidden under {@container_(width<480px)}] + favourite star + ⋯ overflow`.
  The copy commands are duplicated in the ⋯ → Copy submenu (`items` \~line 528),
  so folding them loses no action.
- Every peek host makes its own header bar the size container, so the unnamed
  query resolves against the bar itself, not the window:
  `IssueDetailPane.tsx:21`, `MyWorkIssuePane.tsx:38`, `WorkInboxPage.tsx:1032`
  all carry `[container-type:inline-size]` on the sticky header. At the \~400px
  peek width the copy icons fold away, leaving identifier + save status + star
  - ⋯ + open-full + close (≈5 small controls) — no clip, star/⋯ always reachable.
- At 480–500px the copy icons return; worst case is \~7 `icon-sm`/`icon` buttons
  ≈ 200px of controls in a ≥480px bar — still fits with room for the identifier.
- Full page (`TaskDetailPage.tsx`): the unnamed query resolves against the
  `WorkSurface` root (`@container/work-surface`, `container-type:inline-size`),
  so the icons fold only when the whole surface is <480px. Correct behavior.

## B. Dead code cleanup — DONE

- `taskDetail.relations.none` removed from all three sources:
  `packages/locales/src/default/chat.ts`, `locales/en-US/chat.json`,
  `locales/zh-CN/chat.json`. No `t('taskDetail.relations.none')` or dynamic
  `taskDetail.relations.${kind}` path can reach it — `ISSUE_RELATION_KINDS` is
  only `blockedBy|blocking|relates`. Other generated locales never held the key.
- `TaskLabelSelector.defaultOpen` removed (prop, destructure, `Popover` arg).
  Verified unreferenced: only `TaskProperties.tsx` and
  `TaskPropertiesSetupModal.tsx` render the selector, neither passes it.
  `TaskProperties.test.tsx` cleaned to match — the `labelSelectorDefaultOpen`
  capture mock, its `mockClear`, and the now-vacuous
  `not.toHaveBeenCalledWith(true)` pin are gone (the prop's absence is the
  guarantee).
- `TaskRelatedSection.tsx:~575` doc comment updated: rows are status-icon +
  title; the identifier stands in only for a nameless row (matches the render
  at lines \~456-468).

## C. keepMounted deep-link — FIXED

`TaskActivities.tsx`: the feed's `CollapsibleContent keepMounted` keeps cards
mounted but `hidden` when collapsed (Base UI `Collapsible.Panel`: `hidden =
!open && !mounted`, applied once the close completes). A `#comment-<id>`
arrival fired the card's `useAnchorHighlight` scroll while hidden — a no-op —
and `isTarget` never flipped again, so nothing re-fired after the expand.

Fix: a second effect next to the existing expand-on-link effect — once
`isExpanded && hasLinkedComment`, re-fire
`getElementById(hash.slice(1)).scrollIntoView({ block: 'center' })`. On an
already-open feed it repeats the card's own scroll (idempotent); on a
collapsed feed it lands in the commit right after `open` drops `hidden`.
No animation styles exist on this panel, so the re-fire timing is exact.

## D. Folded W5 minors — DONE

1. `TaskActivities.tsx` — `useEffect(() => setReplyTarget(null), [activeTaskId])`:
   a reply chip set on issue A can no longer aim issue B's composer at A's
   comment id (which deterministically hit the model's same-task parent check).
2. `commentThreads.ts` — `splitCommentThreads` now resolves each reply's
   *topmost in-list ancestor* (walk the `parentCommentId` chain with a `seen`
   cycle guard). Reply-to-reply lands on the thread root (same normalization
   `TaskModel.addComment` applies at `models/task.ts:~4299`); a reply whose
   chain leaves the list nests under its nearest remaining ancestor; a reply
   with no in-list ancestor stays top-level — same as before. Fixes the silent
   drop: `repliesByParent` keyed by a nested card's id was never read.
3. `apps/server/src/routers/lambda/task.ts` — `parentCommentId:
   z.string().trim().min(1).optional()`. Previously `''` passed validation,
   slipped past the model's `?? null`, and hit the `parent_comment_id` self-FK
   as a 500. Now rejected `BAD_REQUEST`, matching the sibling comment routers'
   `idSchema = z.string().trim().min(1).max(255)` convention
   (`documentComment.ts`, `topicComment.ts`). Chose reject-over-normalize so a
   client bug surfaces instead of silently posting top-level.

## E. Setup modal Related fold — ACCEPTED (no change)

`TaskPropertiesSetupModal` renders the shared `TaskRelationFields showAllKinds`;
the 5-row fold (`collapseRelationRows`) and the "Mark current issue as" add
menu are intrinsic to that shared component, not dialog-specific chrome.
Removing them for the dialog would need a feature flag/split — not trivially
safe, and the fold+menu is the correct Linear grammar on every surface.
Accepted as-is.

## Tests added

- `commentThreads.test.ts` — reply-to-reply reattaches to the root bucket;
  reply nests under nearest remaining ancestor when the root is missing.
- `TaskActivities.test.tsx` — deep-link into a folded feed reopens it and
  re-fires the card scroll on the `comment-c1` anchor; reply chip clears when
  the feed rebinds to another issue. Test harness: `useLocation` mock now reads
  `mocks.hash`, `CommentCard` mock carries the `comment-<id>` anchor + a reply
  trigger, `CommentInput` mock exposes `replyTarget`, `scrollIntoView` stubbed
  on `Element.prototype`.
- `task.integration.test.ts` — `addComment` rejects `parentCommentId: ''` and
  `'   '` with BAD_REQUEST and stores nothing.

## Verification limits

Local vitest/typecheck are blocked in this environment (repo policy — CI is the
gate). All behavior fixes above carry regression tests; CI covers them.
