# Project typography — measured foundation slice

## Evidence and scope

2026-09-22, light theme, English product controls, authenticated reference CDP
9222 and Electron 9223. Reference project Activity URL is the project recorded
in `activity-composer-controls.spec.md`; candidate is
`app://renderer/orvilo-dev/project/wave-2-verify-project/activity` at `52350162`.
Both show the Update composer. No reference data was modified.

`CSS.getPlatformFontsForNode` confirms Inter Variable / InterVariable-Medium
for reference Overview, Properties, Comment, Update and Post update text.
Candidate renders Geist Medium / Geist-Medium for all five. This is an actual
glyph font difference, not merely a computed fallback-list difference.
Reference `font-feature-settings: normal`; candidate inherits `cv01`, `kern`,
`tnum`. Both have normal variation settings and automatic optical sizing.
Overview and composer buttons are 12px/500; Properties is 13px/500.
Line heights and colors still differ and are not certified by this slice.

## Implementation plan

- Shared Web/Electron owner: `src/features/Projects/Layout/index.tsx`.
- Bundle unmodified Inter normal/italic variable assets from the OFL-1.1
  `@fontsource-variable/inter` 5.3.0 archive, including its license and source
  metadata. Use standard (weight + optical-size) assets and upstream subsets.
- Keep font assets under `src/assets/fonts/inter`, imported by Project Layout;
  Vite/Next must bundle them rather than relying on system fonts or a live CDN.
- Use existing locale fallback generation and preserve an explicitly selected
  user font. The default Project font becomes Inter Variable.
- Change only typography. Inherit the existing antd theme and override its font
  token locally; do not instantiate a fresh Lobe palette or global resets.
- Keep code-font selection, branding, global shell colors and unrelated WIP.

## Acceptance boundary

Verify actual loaded fonts after HMR using CDP, not just `document.fonts.check`.
Compare existing controls' colors before/after and retain differences to Linear
as explicit gaps. Verify local input controls and portal content separately:
React theme inheritance alone does not prove DOM font inheritance through portals.
Web runtime, non-Latin/italic content, font preferences, narrow layout, modal
portals and different themes require separate coverage before whole-page approval.

## Local verification after implementation

Electron HMR at `52350162` plus this font patch: all five sampled controls render
the bundled Inter (`Inter-Regular_Medium` internal PostScript name), rather than
Geist. Their sampled colors/backgrounds are unchanged. Visible property inputs
and the empty composer inherit the new family and normal feature settings.
The Google Fonts edition has a different internal font name from the reference;
this is not evidence of identical font binaries or exact glyph metrics.
The full-window capture was inspected locally at
`/tmp/orv-update-activity-9223.png`; private evidence was not published.

The package-manager installation was stopped when it began resolving unrelated
workspace dependencies. No manifest or lockfile change was retained. Assets were
instead extracted from the fixed archive above (14 WOFF2 subsets, two upstream
stylesheets, license and metadata; approximately 744 KiB total).

Independent review identified a release-blocking notice-distribution gap. The
complete notice now has a static `new URL(..., import.meta.url)` asset reference
and a `rel="license"` link from Project Layout. Electron CDP fetch of the linked
`LICENSE.txt` returns 200 and contains the complete OFL heading and copyright.
This fixes the source-only notice path; final packaged-build checks remain part
of the deferred final gate.

The existing empty fixture still renders a 66px card and 32px button. Its natural
button width is now 196.281px versus the recorded reference 200.734px; investigate
font edition/metrics and icon/gap rather than hardcoding the reference width.
