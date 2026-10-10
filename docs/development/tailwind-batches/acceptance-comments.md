# Acceptance comments presentation

Continues #577 in eight files: shared timeline styles, discussion, comment cards/threads/composer, evidence comment modal, reviewer approval bar and thread evidence caption. DOM and all mutation, validation, permissions, attachment and keyboard flows remain unchanged. Theme-dependent reaction picker and author palettes remain for a later hook migration.

Secondary text, borders, container and elevated surfaces map to muted-foreground, sidebar-border, card and popover. Tertiary text, info borders, quaternary fills and theme motion keep their exact variables. Own-comment borders retain the 45% info-border mix; anchored comments retain their independent two-pixel outline. No raw colors or new design tokens.

The timeline keeps the 32px avatar, 12px gutter, 19px box inset, 20px event dot and 14px entry gap: rail starts at 62px, event entries at 53px and nodeless entries at 44px. Positioned opaque boxes/dots still cover the rail. The tail pseudo-element retains its repeated-selector specificity, overriding first/last truncation; hover and touch action reveal remain. Zero line-height on the avatar column is explicit.

Metadata preserves 12/13/14px sizes with original inherited or 1.65/1.7 line heights. Evidence thumbnails retain 64×44px sizing, 6px radius, two-pixel selection border and cover fit; approval cards keep 12px radius and stage previews 8px radius. Native buttons keep their existing background reset and hover tones.

The composer now passes the existing conditional minimum height directly to the local Textarea's native textarea, eliminating the descendant important override and wrapper CSS variable. The 20lh maximum, field sizing and falsy minHeight behavior remain unchanged. No DOM restructuring is needed because the local primitive already forwards style to the textarea.

Validation: scoped check, related tests, normal hooks and one independent light review. No source-string assertions for class-only changes. 未做真机验证；no Electron acceptance or visual parity claimed.
