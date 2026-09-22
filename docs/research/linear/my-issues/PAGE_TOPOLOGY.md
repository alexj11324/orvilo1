# My issues page topology

## Reference

At 1440×900 the application rail occupies x=0–244. The My issues surface begins at x=244 and stays a single full-width collection; it does not use a master-detail split by default.

1. Header title: `My issues`, 13px/500, at x≈262.5 and y≈22.5.
2. View tabs: `Assigned`, `Created`, `Subscribed`, `Activity`, each 28px high starting at y≈60.25.
3. Right header controls: icon-only `Add filter`, `Display options`, and `Open details`.
4. Collection body: collapsible groups or an ungrouped list. Rows begin at x≈244.5, span ≈1176px, and have a 44px pitch.
5. Assigned: Focus grouping, currently `Urgent issues` and `Blocking issues` before ordinary status groups. Parent-child rows use indentation and an elbow connector.
6. Activity: groups by activity date (`Today` in the observed state).
7. Board: status columns replace the list in the same route; switching List/Board does not change the URL.

## Candidate before this slice

The shared Electron candidate was inspected from a recorded starting route of `/inbox`, navigated to `/my-issues`, and restored to `/inbox` after capture.

- Assigned was a confident empty state.
- Before the PMI seed extension, Created used the real work-query path and showed 16 `PTP-*`
  rows in one Completed group. The maintained seed now adds six `PMI-*` rows created by the same
  synthetic user, so the expected current Created total is 22; runtime confirmation is recorded
  separately from this pre-change baseline.
- Candidate rows measured x=261, width=1122, height=38; the collection's 16px body gutter kept them narrower than the reference.
- The candidate toolbar exposed text controls (`No project`, `Delegated to agents`, `List`, `Board`, `Save as view`) while the reference exposes three icon entry points and moves view settings into Display options.

## State ownership

- Tab and layout are URL/query state owned by `MyWorkPage`.
- Task membership and attention groups are server results owned by `WorkQueryModel`.
- Group collapse is local transient state owned by `WorkQueryStatusGroup`.
- Parent relationships are real `tasks.parentTaskId` values; indentation is rendering state derived from rows already returned by the query.
