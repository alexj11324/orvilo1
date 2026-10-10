# Acceptance evidence review presentation

Continues #577 in six evidence files: shared media styles, region notes, zoom/pan stage, desktop/mobile review shells and native image annotation. DOM, normalized rectangle geometry, gesture handlers, review model, draft/attachment flows and submit behavior stay unchanged. Lobe Image/lightbox and responsive-hook consumers remain for separate migration.

Secondary borders, elevated surfaces, container surfaces, secondary text, error fill and popover shadow map to sidebar-border, popover, card, muted-foreground, destructive and shadow-popover. Exact tertiary/link/light-solid colors, quaternary washes and legacy radii keep existing variables. Code evidence uses font-mono, the same engine code family.

The annotation frame still shrink-wraps the image; inline zoom widths can exceed its normal 100% cap. Read-only and editable rectangles retain normalized positions, two-pixel borders and 4px radius. Outer black and inner white one-pixel halos retain 45% opacity using existing Tailwind primitives. Badges retain 18px diameter and -9px offsets; coarse-pointer delete targets remain 24px with -12px offsets. Resize handles retain 12px size, -6px offsets and the invisible 16px hit-area extension.

The stage keeps native scrolling/panning, overscroll containment, 120px minimum height and auto-margin centering. Desktop notes remain 320px wide, thumbnails 72×48px and floating zoom controls keep 99px radius. Mobile stage remains 42dvh with 220px minimum, textareas keep 16px text and the footer button keeps a 44px minimum height. Region metadata retains 11/12/13px sizes and existing inherited line heights.

Validation: scoped check, related tests, normal hooks and one independent light review. No source-string tests for class-only changes. 未做真机验证；no Electron/mobile acceptance or visual parity claimed.
