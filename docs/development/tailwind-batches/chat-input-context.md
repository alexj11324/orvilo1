# Chat input context and attachment presentation

Seven files remove direct antd-style imports: desktop element/selection/upload
chips, mobile file cards and their scroller, the local-file editor tag and the
workspace-file drag preview's token references. Selection, uploading, retries,
file opening and drag payload/lifecycle logic are unchanged.

Exact legacy geometry, code line height, tertiary/quaternary colors and radii
remain explicit. The mobile file action keeps its existing white foreground over
the mask/destructive background, including hover and active states. Local-file tag
selection outlines and the shared tag margin are retained. Drag-preview colors
are still resolved at the source before moving the preview to document.body.

The mobile image wrapper remains for the image/lightbox migration because its
third-party size overrides currently require important declarations. No new
important modifiers or global CSS-layer changes are introduced.

Scoped checks and an independent review are recorded on the PR. 未做真机验证；
no visual parity or Electron acceptance claimed. No stylesheet-string tests.
