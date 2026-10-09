# Loading, empty and error states

Rule R16 of the UI audit: every data surface needs a loading, an empty and an error state, built from the
shared components.

- Inside a `Button`, show busy state with the local Button's `loading` prop, never a hand-written
  `Loader2` + `animate-spin`.
- Everywhere else use `@/components/ui/spinner`; use skeletons shaped like the loaded rows for known
  shapes (same grid, same row height). See the `react` skill "Loader selection" and `ux` feedback 4.1.
- A panel must never render `null` while loading, failing or missing its data. Follow
  `Portal/TaskDetail/Body.tsx`; portal bodies backed by the Goal store or verify state use
  `Portal/components/PortalBodyState.tsx`.
- Empty states use `@/components/SimpleEmpty` (`Portal/SimpleEmpty` re-exports it).

Skeletons added or aligned: `Automations/AutomationSkeleton.tsx`, Memory `Loading` / `DetailLoading`
(18px line + 2px margin = 22px text slot), WorkTeams and MyWork row skeletons (36px team rows, 44px
issue/project/view rows).
