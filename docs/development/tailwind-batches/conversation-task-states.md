# Conversation task states

Five shared conversation task-state components replace direct antd-style imports
with Tailwind utility strings and existing semantic CSS variables. Completion and
error metrics, task-avatar paint, initialization spacing and processing bars keep
their existing layout. Description/quaternary text and primary-hover wash retain
exact legacy variables pending shared theme migration.

The processing shimmer reuses the existing global `text-shiny-sweep-transform`
keyframes: its empty absolute overlay moves from -100% to 100% of its own width,
with the same two-second ease cycle. That element has no other transform; the
existing translate-based sweep therefore supplies the same movement without a
second keyframe definition. Reduced-motion still hides the overlay.

Unused initialization progress/shimmer styles and the unused error status-icon
style are removed: none of their keys are referenced by the components. Timers,
polling, error extraction, metric formatting and content rendering are unchanged.
Scoped checks and independent review are recorded on the PR. No source-string
tests are added for pure styling. 未做真机验证；visual parity and Electron acceptance
are not claimed. The shared neural-network loader remains separate migration work.
