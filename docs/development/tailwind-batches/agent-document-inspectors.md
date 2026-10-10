# Agent document inspector Tailwind migration

Related to #577.

## Scope

Replace the nine inspector modules and their shared chip styles with Tailwind utilities. Keep title truncation, raw document ID formatting, scope/count metadata, removal strike-through, streaming/loading shimmer, and all argument/result fallback logic.

The shared style object remains the single source for chip classes. Use existing foreground, muted-foreground, accent, and destructive tokens. Keep exact tertiary/quaternary text, code font, and error-border variables until their semantic mappings are established.

The removal label retains its inline semantic color because the existing unlayered shimmer must not override its destructive color. Shared inspector root and shimmer remain outside this batch, as do the document result/streaming cards. No global CSS-layer change.

## Validation

Run the scoped repository check and normal commit hooks, then independent light review. No source-string tests are added for the styling-only change. No Electron or real-device visual acceptance has been performed; source review and CI do not establish visual parity. #577 remains open.
