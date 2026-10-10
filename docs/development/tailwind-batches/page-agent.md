# Page Agent display styles

The seven Page Agent Inspector, Render and Streaming components no longer
import antd-style directly. Initialization preview limits and title extraction,
node-operation counting/results, text replacement and animated counters keep
their existing logic.

Utility strings use the existing card, sidebar border, primary, foreground,
secondary text, code font, accent and status semantic values. Unmapped
description/quaternary text and the runtime result radius retain exact existing
CSS variables until the shared theme migration. Existing 8px card and 4px badge
geometry, logical bottom borders and margins are preserved.

Shared shimmer/highlight/ellipsis definitions remain their current owners.
Streaming labels retain the stronger shared secondary shimmer color. EditTitle
always renders child markup, so its composed row does not match the shared
shimmer's leaf-only positioning rule; the row and shimmer share the same
secondary text value. The class composition does not merge conflicting values.

Scoped checks, normal hooks and independent review are recorded on the PR. No
source-string tests for style conversion. 未做真机验证；no visual-parity claim.
Shared Markdown, animated counters and theme dependencies remain separate work.
