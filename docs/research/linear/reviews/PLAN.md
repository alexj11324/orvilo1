# Reviews parity plan — 2026-09-25

## Scope and evidence

- Reference: authenticated Linear `linear.app/bdiverifier/review/...` in Brave CDP, English, light theme, 1440 × 900 CSS px, populated PR and queue. The exact PR was also opened in Orvilo.
- Candidate: production Orvilo `/ws-useryhn4omi0/reviews/gh%3Agithub.com%3A...`, zh-CN, light theme, same viewport, same GitHub PR. The user supplied a 2048 px screenshot pair; local CDP captures are retained outside Git under `/private/tmp/reviews-*` because they contain private account content.
- Code base: `feat/github-oauth-review` at `ecaf92045`, isolated on `feat/reviews-linear-parity`. This branch depends on the OAuth PR for populated runtime acceptance.
- Destination: the existing Reviews list and detail routes. Feature owners are `src/features/Reviews/ReviewsPage.tsx`, `ReviewPullRequestPage.tsx`, and `reviewQueueGroups.ts`; the server queue owner is `apps/server/src/services/pullRequestReview/index.ts`. No new route or asset tree is planned.

## Observed page structure

- Linear list navigation occupies about 480 CSS px after a 244 px sidebar. Its 28 px pill tabs and compact group headers stay above dense PR rows. Orvilo's sidebar is user-resizable and was persisted at 280 px during the capture; its default is already 244 px. The page must not override that user preference.
- In the split detail state, Linear has a 44 px top context row with issue/PR title and additions/deletions. A second row carries **Overview** and **Diff** (28 px pills) and the available primary action. The detail content scrolls independently of the queue.
- Overview: prominent PR title (roughly 24 px, weight 600), author plus base/head branch line, an unboxed Markdown description column, and a right rail with Status, Resolves, Reviewers, Checks, Branch, and changed files. The rail lists changed filenames; the diff itself is not interleaved with the description.
- Diff: the second row remains, followed by a full-width file count/control bar and expanded diff cards. The captured diff used full width of the detail pane, with file path, additions/deletions and reviewed state in each header.
- Linear's diff pill opens a menu with “View diff” and “Review diff in full window”; selecting “View diff” navigates to `/changes`. Read-only CDP interaction confirmed this transition. The overview pill returns to the base route. Direct loading of the base Linear URL opens a standalone detail layout, whereas entering from Reviews keeps the list; this distinction is recorded but not required for this split-page change.
- The Orvilo candidate currently displays a 240 px file navigation pane and a fixed review form on both states, shrinking Markdown to a narrow card. Those are the main structural causes of the reported gap.

## Behavioral boundaries

- Overview and Diff must use the same real `PullRequestDetail`, pagination, stale snapshot guard, and existing thread/comment paths. A tab switch must preserve the selected PR and not dispatch a write.
- File navigation moves into the Diff view. Overview shows the changed-file outline in the rail. Selecting an outline file opens Diff and scrolls to that file.
- Keep review submission available through an explicit action, preserving the existing draft, unknown-outcome, and stale-snapshot behavior. The product currently has no merge API; do not label the action “Merge” or simulate it.
- Queue grouping must not claim “Ready to merge” from approval alone. The server must provide a real merge state before using that label. An unverified state stays in a neutral group.
- Preserve the separate Orvilo in-product approvals section and its data. Its placement can be secondary to the GitHub queue, but its empty state must remain reachable.

## Acceptance

1. In the same populated PR at 1440 × 900, Overview has a wide description and right rail; diff cards and the review form do not occupy the initial reading viewport.
2. Clicking Diff shows full-width file differences; clicking Overview restores the description. A file in the rail opens its diff without losing PR identity.
3. With a 390 px width or narrow window, controls and content remain usable and the detail route still returns to its list.
4. Existing queue/detail tests, a focused regression for any semantic grouping change, lint, and a real browser session verify the final revision. Full `tsgo` remains remote CI only.

## Unknowns

- Linear's exact merge permission, reviewer assignment, issue linking, and review submission outcomes were not mutated in the reference. Orvilo has no matching write contracts for merge or issue linking; those actions must not be invented for visual parity.
- The user selected zh-CN in Orvilo and English in Linear. Text length differences are locale effects; geometry and hierarchy are compared against matching PR data and viewport.
