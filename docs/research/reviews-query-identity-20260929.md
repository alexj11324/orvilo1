# Reviews queue query identity and real link rows

## Observed failures

`/reviews` kept cursor pagination in component state that was only _cleared_ on
tab/workspace change — never bound to the query that produced it:

- `loadMoreQueue`/`loadMoreGroup` awaited a fetch then wrote back
  unconditionally, so a response issued under the old tab appended rows (or a
  rejection cleared `queueLoadingMore`/recorded an error) under the new tab.
- `refresh` reset `groupTail` but not `queueTail`/`queuePaging`, so a refetch
  could reuse a cursor minted by the pre-refresh snapshot.
- `queueTail` concatenated onto the SWR first page with no seam dedupe.
- `usePagedLoadMore` error slots are written without scope checks — a stale
  rejection could surface under the new query.

Separately, `PullRequestRow` simulated a link (`role="link"` + unconditional
`navigate` on click): no `href` to copy, no modifier/middle-click handling —
`navigate` ran on every click.

## Design

`ScopedTailPager<T>` (new, `src/features/Reviews/scopedTailPager.ts`) mirrors
`InboxFeedPager`'s scope + generation discipline for any `{items, hasMore,
nextCursor}` page: `setScope`/`reset` bump the generation, `loadMore` captures
`{scope, generation}` before awaiting and commits only while the token is
current, `tailFor(currentScope)` hides a not-yet-reset tail, and a `key`
argument namespaces per-group pending/error slots.

The PR queue binds `queueScope = [workspaceId, tab]` and merges pages with
`mergeWorkQueryPage` (stable-`id` dedupe, which also covers the first/tail
seam when merged with the SWR page at render). The in-product groups bind
`groupScope = [workspaceId, tab, queryHash]` — a refetched snapshot rebinds
the pager on its own — and merge via `mergeWorkQueryGroups`. `refresh` calls
`reset()` on both pagers before revalidating, so stale cursors and in-flight
writes are dropped together.

`PullRequestRow` is now a real `WorkspaceLink` (`<a href>` with `state`) —
normal click, Enter, ⌘/Ctrl+click, middle click and copy-link behave
web-natively; `WorkspaceLink.desktop.tsx` forwards `state` to the
intercepted `navigate` so Electron keeps `returnTo`.

## Verification

`scopedTailPager.test.ts` (7 tests): stale tab write-back dropped, stale
`finally` can't clear the new pending, `reset()` kills in-flight commits,
per-scope errors and keyed concurrency. Typecheck green; existing
`mergeWorkQueryPage`/`mergeWorkQueryGroups` dedupe reused unchanged.
