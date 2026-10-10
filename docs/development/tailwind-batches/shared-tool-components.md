# Shared tool components

File paths, file-change statistics, todo progress and question option cards now
use Tailwind utilities and local `cn` instead of direct antd-style imports. The
existing geometry, mono font, status fills, logical spacing and progress-ring
transition are preserved. Quaternary fill retains its exact legacy CSS variable
pending the shared theme migration.

Option selection retains the accent fill on hover; keyboard highlighting remains
an inset border independent from selection. The local `cn` merge resolves the
selected hover utility after the unselected hover utility. No option handling,
disabled behavior, counters, path parsing or progress calculations change.
File-change consumers only supply an extra font weight, so the new shared utility
composition does not remove their override. Material file icons still use the
existing LobeHub component; replacing its file-type artwork is separate work.

Scoped checks and independent review are recorded on the PR. No source-string
tests are added for style conversion. 未做真机验证；visual parity and Electron
acceptance are not claimed. Shared shimmer and icon dependencies remain.
