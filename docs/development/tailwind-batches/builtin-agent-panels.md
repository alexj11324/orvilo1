# Builtin agent panels

Continues #577 in eleven builtin-tool-orvilo-agent client files: intervention, render/streaming panels, sortable todo rows and subagent stats. Inspector text/shimmer composition remains for its shared-style migration. Lobe Markdown/editor and package peer dependencies remain; this batch does not claim their removal.

All DOM, plan edits, editor registration, focus/cursor restoration, keyboard handlers, store updates, checkbox behavior, drag wiring and subagent thread actions remain unchanged. Existing status aliases, legacy text colors/radii, quaternary fills and dashed separators preserve their roles. Plan context still scrolls at a 100px maximum; metadata inherits its previous line height; opacity transitions retain 200ms CSS ease.

The plan Textarea classes explicitly retain both base and md font sizes (28px title, 14px description) and the primitive's original base/md line-height variables. The thread button keeps 22px height, 6px horizontal padding and its small-button line-height after cn merging. This avoids losing bundled line-height or allowing the primitive's md:text-sm to override the old fixed size.

The todo drag handle's legacy width important is removed: the current local SortableItemHandle supplies no width and forwards className to its native div, so w-4 preserves 16px through the public API. Hover-revealed handle/delete controls retain their local descendant markers and opacity. Existing sortable cursor modifiers are outside these files and unchanged.

Validation: scoped check with selected package tests, normal hooks and one independent light review. No source-string tests for style substitutions. 未做真机验证；no Electron/mobile visual parity or drag runtime acceptance claimed.
