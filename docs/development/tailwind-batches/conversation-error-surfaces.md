# Conversation error and authorization surfaces

This #577 batch replaces seven `antd-style` imports in conversation error cards
and the welcome tool-authorization alert. Error routing, retries, billing facts,
upgrade destinations, clipboard handling, OAuth polling and permission gates stay
unchanged. The shared setup/error shell keeps its supported gap, padding and style
props; both its known consumers keep their existing layout behavior.

Error borders and foregrounds use the existing roles. The 8px action card uses the
card radius; the separate legacy large-radius shells retain their exact radius
variable. Form width remains 360px above 768px and 90% at or below 768px. Budget
facts keep 13px/1.4 text and explicit warning weight/color. Authorization removal
icons retain hover-only reveal and their 200ms ease opacity transition.

Tertiary, quaternary, split, link and avatar-fill variables without exact role
aliases remain native CSS variable references for the later #693 role pass. The
existing Discord brand color in the trace report link remains a brand exception.
No palette, font-size normalization or control-height changes are part of this batch.

Scoped existing tests, actual Tailwind CSS generation, normal hooks and an
independent light review cover this batch. Electron light/dark captures remain
unavailable; no runtime visual parity is claimed.
