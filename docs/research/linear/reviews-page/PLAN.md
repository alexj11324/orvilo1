# Linear Reviews parity output plan

## Evidence scope

- Reference list: `https://linear.app/bdiverifier/reviews`
- Reference created list: `https://linear.app/bdiverifier/reviews/created`
- Reference detail: one existing readable `/review/:slug` selected from each list
- Candidate routes: `/reviews`, `/reviews?tab=created`, `/reviews/:reviewId`
- Reference session: normal authenticated Brave profile, dedicated read-only Reviews tab, 2026-09-22
- Measured viewports: 1440×900, 768×900, 390×844; light theme; English locale
- Candidate root: `/Users/alexjiang/Desktop/vibe/orvilo-linear-parity`
- Site/page key: `linear/reviews-page`

The connector exposed screenshots to the live inspection session but did not provide a file export path. No private pull-request titles, avatars, or descriptions are copied into this repository.

## Owned output

- `src/features/Reviews/ReviewsPage.tsx`: queue, tabs, selection and responsive shell
- `src/features/Reviews/ReviewPullRequestPage.tsx`: existing action-complete detail embedded in that shell
- `src/features/Reviews/reviewsSurface.ts`: wide versus narrow surface policy
- `src/features/Reviews/reviewsSurface.test.ts`: policy regression coverage
- `src/spa/router/desktopRouter.shared.tsx` and `mobileRouter.config.tsx`: one optional-parameter Reviews route preserves the mounted queue between list/detail URLs
- `docs/research/linear/reviews-page/*`: evidence and bounded gap log

No sidebar, Inbox, My issues, Project, shared WorkSurface, service, or locale owner is changed.

## Observable success

1. Wide screens keep the real GitHub queue mounted beside an empty or selected detail pane.
2. Selecting a queue row changes to `/reviews/:reviewId`, visibly marks that row, and preserves the exact list tab for Back.
3. The embedded detail preserves the existing files, checks, paging, inline threads, stale-head guard, comments and review-submit footer.
4. Narrow screens show the queue or a full-pane detail, and Back restores the preserved list.
5. `For me` and `Created` continue to query their real server-defined scopes; pagination and in-product approvals remain reachable.

Failure conditions are a blank dead column, a detail route that unmounts the queue on wide screens, an action/footer lost by embedding, a row that cannot be keyboard-opened, a stale tab on Back, or a narrow layout showing both panes squeezed together.

## Bounded non-goals and remaining evidence

- Linear's Add filter and Display options controls are inventoried in `BEHAVIORS.md`. Orvilo's queue API exposes tab and cursor only, so this slice does not add inert menus.
- Linear-specific group semantics such as `Ready to merge` and `Created by you` are not inferred from Orvilo's smaller queue response.
- The existing localized tab says `For me`; the measured reference says `For you`. Locale owners are outside this lane, so the wording remains a tracked gap.
- The existing Orvilo detail remains the real writable review surface. Exact Linear Overview/Diff composition is a later slice; this change only embeds it without dropping any action.
- Candidate runtime evidence is recorded in `CANDIDATE-VERIFICATION.md`; the available account was disconnected from GitHub, so populated candidate rows/actions remain unverified.
