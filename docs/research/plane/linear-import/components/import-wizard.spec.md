# Linear Import Wizard Specification

## Overview

- Source: Plane Linear importer, authenticated connected state
- Interaction model: click-driven four-step wizard with searchable comboboxes
- Screenshots: `docs/design-references/plane/linear-import/01-configure-plane.png` through `04-summary-before-confirm.png`
- Detailed evidence: `docs/research/plane/linear-import/REFERENCE_FLOW.md`

## Structure

1. Page header with Back to Imports, Linear logo, and Linear title.
2. One bordered, rounded wizard card.
3. Left desktop progress rail with four dot-and-line steps.
4. Right content column with a fixed header, scrolling body, and bottom action footer.

## Step state model

- `configure-plane`: destination Plane project combobox; Back disabled.
- `configure-linear`: source Linear team combobox.
- `map-states`: one Plane-state combobox for each Linear state.
- `summary`: entity counts, unchecked skip-user checkbox, final Confirm.
- Next/Back changes local step state on the same route and preserves all selections.
- Confirm is the only observed final mutation boundary.

## Visual values

- Desktop card: 1 px subtle border, 8 px radius, 25% / 75% columns.
- Rail/content padding: 24 px desktop.
- Title: 16 px / 24 px, 500.
- Description: 14 px / 21 px, 400.
- Labels/table headings: 13 px / 19.5 px.
- Buttons: 24 px high, 13 px / 20.02 px, 6 px radius, 8 px horizontal padding.
- Footer: top divider, 16 px vertical padding, Back left and Next/Confirm right.
- Use the complete measured values and OKLCH colors in `REFERENCE_FLOW.md`.

## States and behaviors

- Active/completed progress dots and connectors are blue; upcoming states are pale neutral.
- Combobox opens an anchored searchable list with selected state indicated.
- Escape closes a combobox without changing its value.
- Back preserves project, team, and mappings.
- Configure Plane Back is disabled.
- Summary skip-user checkbox defaults to unchecked.

## Known gaps

- Fresh OAuth/PAT connection UI was unavailable because the reference session was already connected.
- Tablet/mobile layout was not visually captured. Narrow layout details derived from live responsive classes must be treated as an implementation hypothesis until runtime verification.
