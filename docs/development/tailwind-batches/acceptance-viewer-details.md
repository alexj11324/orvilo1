# Acceptance viewer details

Continues #577 in the identity header, decision bar and shared checklist styles. Existing global CSS owns the two distinct completion keyframes; Tailwind animation utilities preserve their timing, scale and fill mode. The decision cue keeps its reduced-motion override. No state, effects, counts, store, routing, actions, translations or DOM structure change.

Preserves inclusive mobile media conditions, safe-area offsets, floating bar width from the shared layout constant, secondary text and exact status roles. Check rows retain keyboard focus and hover action reveal, fine-pointer-only hidden metadata, open-row background behavior, mobile grid positions, first-child dividers and stale-evidence opacity. Existing descendant marker selectors are retained rather than moving nodes.

Validation: scoped check, generated utility inspection and one independent light review before publication. No source-string tests for pure style substitution. 未做真机验证；no Electron/mobile visual parity claimed.
