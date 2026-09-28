# Reviews page topology

## Wide reference at 1440×900

The application sidebar occupies the first 244 px. The page `main` begins at x≈243 and is 1189×856 with a rounded outer surface.

1. **Master list pane** — x≈244, width≈482, full page height.
   - 44 px header: Reviews title, Add filter, Display options.
   - 44 px tab row: `For you`, `Created` pill links.
   - Independent vertical scroll region.
   - 28 px sticky group headers.
   - 40 px review rows with pull-request glyph, one-line title, conditional state glyph and relative age.
2. **Detail pane** — x≈726, remaining width≈706, independent vertical scroll.
   - With no selection: centered illustration and aggregate review count.
   - With selection: independent header, `Overview` / `Diff`, pull-request metadata, description, activity and diff surfaces.

Selecting a row changes the URL and the detail content while the master list, current tab and scroll context remain mounted.

## Narrow reference

- At 768×900 the global sidebar and detail pane are absent; the Reviews list fills the available width.
- At 390×844 the same single-list topology remains; titles truncate and the age stays right aligned.
- A selected detail becomes the foreground surface. Returning restores the list rather than rebuilding a new queue context.

## Candidate assembly

The candidate uses the existing `WorkSurfaceSplit` frame at 482 px for the wide master pane. The list always owns one scroll region. The existing `ReviewPullRequestPage` mounts inside the detail pane, retaining its pinned file navigation and submit footer. At tablet/mobile breakpoints, a route-backed detail overlay becomes the only visible surface while the list stays mounted below it.
