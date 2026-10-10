# Project presentation primitives

Six project presentation files replace direct antd-style imports with Tailwind
utilities and existing semantic CSS variables. Section-label secondary text,
status glyph cutouts and milestone chip borders retain their theme roles.
Milestone-muted description text and tertiary/quaternary values retain exact
legacy variables pending the theme migration; the existing milestone brand paint
is unchanged.

The progress summary moves its existing `dt` and `dd` declarations onto those
children directly, without changing the DOM. Creation-event timestamps, creator
provenance, milestone selection, status resolution and issue progress computation
remain unchanged. Existing 1px marker and 4px chip geometry is preserved.

Scoped checks and independent review are recorded on the PR. No source-string
tests are added for style conversion. 未做真机验证；visual parity and Electron
acceptance are not claimed. Remaining project styles and theme dependencies are
tracked separately.
