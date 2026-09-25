# Reviews candidate runtime verification

## Evidence conditions

- Date: 2026-09-22
- Base revision: `24d099f1a` plus the uncommitted Reviews-only diff described in `PLAN.md`
- Runtime: actual shared Electron renderer, CDP `:9222`
- Provenance: `app://renderer/src/features/Reviews/ReviewsPage.tsx` resolved to `/Users/alexjiang/Desktop/vibe/orvilo-linear-parity/src/features/Reviews/ReviewsPage.tsx`; the loaded source contained `WorkSurfaceSplit` and `reviewsSurface`
- Workspace: `ws-useragenttes`
- Locale/theme: zh-CN, light
- Viewports: 1440×900 and 768×900, DPR 2
- Starting and restored route: `app://renderer/ws-useragenttes/inbox`

The candidate account had no GitHub connection. The runtime therefore proves real disconnected, routing and responsive outcomes. It does not prove a populated Orvilo queue or writable review operations.

## Runtime results

| Check                      | Result                      | Evidence                                                                                                                                                      |
| -------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wide default split         | Pass after fix              | At 1440×900 the list region was `[245,47,482,824]`; the detail region was `[727,47,704,824]`.                                                                 |
| Disconnected state         | Pass                        | List and detail both said that GitHub must be connected; neither presented disconnection as an empty queue.                                                   |
| Created tab                | Pass                        | A hit-tested click changed the URL to `/ws-useragenttes/reviews?tab=created`; `我发起的` had `aria-selected=true`; both pane widths stayed 482/704.           |
| Selected detail route      | Pass within available state | Canonical read-only route `gh:github.com:alexj11324:orvilo1:209?tab=created` kept the 482/704 split and loaded the detail-owned disconnected state.           |
| Narrow detail overlay      | Pass after fix              | At 768×900 list and selected detail each measured `[1,47,758,824]`, with detail foregrounded and a visible `返回拉取请求列表` button.                         |
| Back route/tab restoration | Pass after fix              | A real `Input.dispatchMouseEvent` click changed the URL to `/ws-useragenttes/reviews?tab=created`; only the list region remained and Created stayed selected. |
| Runtime restoration        | Pass                        | Viewport returned to 1440×900 and the Electron target returned to `/ws-useragenttes/inbox` before release.                                                    |

## Failures found by the real path

### Desktop split was initially absent

`useResponsive().tablet` is cumulative and was true at 1440 px. The initial candidate rendered one 1186 px list region and no detail. The page now derives narrow mode from `responsive.lg === false`; the repeat capture produced 482 px and 704 px panes. `reviewsIsNarrow` has a regression test for `true`, `false` and unresolved breakpoint states.

### Narrow Back was initially occluded

The detail overlay used z-index 1 while the list's sticky chrome used z-index 2. The Back button had a box at `[9,57,24,24]`, but `elementFromPoint` hit the underlying Reviews title, so the real click left the URL unchanged. Raising the overlay to z-index 3 made the Back button the hit target; the repeat click restored the Created list URL and state.

## Screenshot artifacts

The screenshot directory is locally ignored by Git and intentionally contains no private reference data:

- `docs/design-references/linear/reviews-page/candidate-list-1440x900.png` — post-fix 482/704 split, disconnected queue
- `docs/design-references/linear/reviews-page/candidate-created-1440x900.png` — Created tab and `Open` group
- `docs/design-references/linear/reviews-page/candidate-detail-1440x900.png` — selected canonical detail route, disconnected state
- `docs/design-references/linear/reviews-page/candidate-detail-768x900.png` — pre-fix occlusion reproduction
- `docs/design-references/linear/reviews-page/candidate-back-768x900.png` — post-fix Back result, Created list restored

## Remaining gaps

- No populated candidate queue was available because GitHub was disconnected. Row selection, active-row paint and loaded ReviewSubmitPanel actions are source- and unit-verified only in this run.
- Linear's filter/display menus have no corresponding queue query contract and remain unimplemented rather than inert.
- Exact Linear `For you` grouping and Overview/Diff composition remain separate slices.
- The existing Orvilo `For me` localized label differs from the measured Linear `For you` label.

## Read-only review follow-up

After this runtime packet, route/state review found three failures and added focused regression coverage:

- Desktop/mobile list and detail previously used separate lazy route elements, which remounted ReviewsPage and lost paged queue/scroll state. Both now resolve through one `reviews/:reviewId?` route identity; the route-shape regression covers both platforms.
- Stale state is keyed by workspace and review id. A late stale result from review A is false under review B and cannot disable B writes.
- A tab click always navigates to the selected collection route, clearing any old detail identity as the queue scope changes.

These follow-up changes have focused lint/test evidence but were not rerun in Electron because the shared runtime was explicitly reserved for later Agent/Projects work.

The next independent review found a remaining cross-review race in that stale-state implementation: if B became stale and an older A refresh completed afterward, the single `{ key, stale }` slot could be replaced with A's clear result and B's write controls could reopen. The state now retains flags per workspace/review key, and each async callback updates only its captured key. The interleaved A/B regression failed before that repair and passes afterward; the focused Reviews check reports lint clean and 3 tests passed. A populated GitHub-connected candidate is still required to exercise the write gate in Electron.
