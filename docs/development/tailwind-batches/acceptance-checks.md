# Acceptance check presentation

Continues #577 in five check files: inventory filter layout, add-check preview card, list/history status colors and shared verdict metadata. Existing DOM, filtering, grouping, review actions, persistence, glyph selection and modal submission behavior remain unchanged.

Filter triggers retain 118px desktop width. The inclusive 767px media query keeps the full-width filter row, full-basis heading and flexible zero-width/min-width triggers. Classes enter local SelectTrigger through its public className API.

The preview keeps 12px padding, 8px card radius, secondary border and the existing quaternary fill variable. Status metadata retains CSS color strings through the existing success, destructive and warning semantic aliases; tertiary/quaternary text retains exact legacy variables. Container backgrounds and secondary borders use their verified card/sidebar-border aliases. Existing per-element font sizes and inherited line heights are unchanged.

Shared animated row styles and CheckRow responsive-hook usage remain outside this batch. Lobe image/lightbox consumers remain. No animation or global cascade changes.

Validation: scoped check and selected related tests, normal hooks and one independent light review. No source-string regression tests for these presentation-only substitutions. 未做真机验证；no Electron visual parity or mobile acceptance claimed.
