# Acceptance flow and layout presentation

Continues #577 in seven viewer files: page layout, goal collapse control, tabs, flow nodes/groups/outline and execution ledger. No DOM, graph topology, interaction handlers, state or data requests change.

Container surfaces map to card, secondary borders to sidebar-border, secondary text to muted-foreground and tertiary fills to accent. Existing status fill colors retain success/warning/info/destructive roles; status backgrounds, primary border/wash, tertiary text and quaternary wash retain their exact legacy variables. Existing radii remain engine-backed.

Preserved scoped geometry: 260px node width; 36px glyphs; 13px/1.4 node titles; 11px/16px subtitles; 7px footer inset; 18px outline indentation; 12px/18px branch labels; ledger 99px pills and 7px horizontal inset. Page detail rail retains min(440px,42%) and the inclusive 767px breakpoint, switching to 50% height. Scroll overflow still reads acceptanceScrollLayout.

React Flow handles use their public style prop for the existing 1px hidden hit targets, zero minimum sizes and border, preserving return-handle offsets. This avoids changing third-party stylesheet ordering or adding important overrides. The node and group share the same six-property style object. Node selection retains its primary border and two-pixel wash shadow. Outline button classes still merge through the existing local Button API.

Goal toggles retain hover, focus-visible and hover:none reveal, exact engine duration and CSS ease; only its three referenced style keys remain. Four unused style definitions are removed because this module has no consumers for them. TabsList receives shadow-none through its existing className API; tab-trigger focus and selected shadows are untouched. Ledger transitions and hover selectors remain as before.

Validation: scoped check, related tests and normal hooks; one independent light review. No source-string tests for class-only changes. 未做真机验证；no Electron acceptance or visual parity claimed.
