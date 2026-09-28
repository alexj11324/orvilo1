# Plane Linear Importer — CDP Reference Evidence

## Capture context

- Source URL: `https://app.plane.so/11111111er/settings/imports/linear/`
- Captured: 2026-09-25, authenticated Plane workspace owner, English, light theme
- Viewport: 1729 × 889 CSS px, device pixel ratio 2
- Route behavior: all four steps stay on the same URL; the body content changes in place
- Safety boundary: inspected with browser CDP/DOM and read-only UI navigation; the final **Confirm** action was never used
- Privacy: screenshots contain workspace-specific project/team names and import counts. Keep these artifacts local and do not commit them.

## Four-step flow

### 1. Configure Plane

Copy: “Please first create the project in Plane where you intend to migrate your Linear data. Once the project is created, select it here.”

- Field label: `Select Plane Project`
- Selected destination: `11111111er`
- Project selector is a searchable combobox. This workspace exposed one project.
- Back is disabled. Next is enabled.
- Screenshot: `docs/design-references/plane/linear-import/01-configure-plane.png`

### 2. Configure Linear

Copy: “Please select the Linear team from which you want to migrate your data.”

- Field label: `Select Linear team`
- Selected team: `orvilo`
- Team selector is a searchable combobox. Observed choices: `Daymark`, `orvilo`.
- Back and Next are enabled.
- The current authenticated state showed no OAuth button, PAT field, connect button, or reconnect control. It therefore does not establish the fresh-connection authentication UI.
- Screenshots: `02-configure-linear.png`, `02-configure-linear-team-picker.png`

### 3. Map States

Copy: “We have automatically matched the Linear statuses to Plane states to the best of our ability. Please map any remaining states before proceeding, you can also create states and map them manually.”

| Linear state | Plane state |
| ------------ | ----------- |
| Triage       | Backlog     |
| In Review    | In Progress |
| In Progress  | In Progress |
| Duplicate    | Cancelled   |
| Todo         | Todo        |
| Backlog      | Backlog     |
| Done         | Done        |
| Canceled     | Cancelled   |

- Each Plane state cell is an independent searchable combobox.
- Observed choices are exactly `Backlog`, `Todo`, `In Progress`, `Done`, and `Cancelled`, each with its category icon/color.
- The observed picker did not expose a create-state action even though the explanatory copy mentions creating states.
- Back and Next are enabled.
- Screenshots: `03-map-states.png`, `03-map-states-picker.png`

### 4. Summary

Copy: “Here is a summary of the data that will be migrated from Linear to Plane.”

| Linear entity | Migrating |
| ------------- | --------: |
| Issues        |       148 |
| States        |         8 |
| Cycles        |         0 |
| Labels        |         4 |
| Projects      |         3 |
| Documents     |         1 |

- `Skip importing User data` is an unchecked checkbox by default.
- Back returns to mapping. Confirm is the final import mutation and was not used.
- Screenshot: `04-summary-before-confirm.png`

## Navigation and persistence

- Next advances one step without a route change.
- Back returns one step without a route change.
- Verified by navigating Summary → Map States → Configure Linear → Configure Plane: the selected Linear team and every automatically selected state mapping remained intact.
- Opening and closing selectors with Escape did not change selections.
- The left rail uses four labeled steps. Completed and current steps use blue dots and a blue connecting line; future steps use very pale dots/line.

## Measured visual system

- Body font: `Inter Variable`, falling back to `ui-sans-serif, system-ui, sans-serif`; 16 px / 24 px.
- Body background: `oklch(0.9614 0.0013 286.38)`.
- Primary text: `oklch(0.1689 0.0021 286.18)`.
- Secondary text: `oklch(0.3225 0.0045 219.62)`.
- Main wizard card at the captured viewport: x 359, y 183.5, width 1313, height 529 px.
- Card: transparent background, 1 px solid `oklch(0.9396 0.0017 247.84)`, 8 px radius, hidden overflow.
- Desktop columns: progress rail 327.75 px (25%); content 983.25 px (75%); 1 px divider.
- Progress rail padding: 24 px; internal rail gap: 24 px; step label 13 px / 19.5 px, weight 500.
- Content header: 24 px padding, 97 px measured height on Summary.
- Content title: 16 px / 24 px, weight 500.
- Description: 14 px / 21 px, weight 400, secondary text color.
- Scroll/body region on Summary: 935.25 × 430 px inside 24 px horizontal margins; vertical overflow enabled.
- Footer: full content width, 16 px vertical padding, 1 px top divider, measured 57 px high; Back left and primary action right.
- Secondary button: height 24 px, 13 px / 20.02 px, weight 500, 8 px horizontal padding, 6 px radius, white background, 1 px `oklch(0.8782 0.0035 247.86)` border.
- Primary button: height 24 px, 13 px / 20.02 px, weight 500, 8 px horizontal padding, 6 px radius, white text, `oklch(0.4799 0.1158 242.91)` background.
- Summary table headers: 13 px / 19.5 px, weight 500, `oklch(0.4176 0.0072 239.98)`.
- Checkbox label: 13 px / 19.5 px, weight 400.

## Responsive evidence boundary

- DOM classes show the rail labels use `hidden md:flex`, the rail uses `md:w-1/4 p-2 md:p-6`, and the content uses `md:w-3/4`.
- These classes imply compact icon-only progress at narrow widths and smaller rail padding. This is an inference from the live DOM, not a visually verified mobile state.
- Raw CDP viewport override was unavailable for this authenticated tab, so tablet/mobile screenshots remain unobserved.

## OAuth evidence boundary

The reference session was already connected to Linear and immediately exposed Linear team choices. No credential exchange or consent screen appeared. The captured Plane wizard can guide Orvilo’s post-connection selection, mapping, summary, and layout. It cannot be used as evidence that Plane itself starts this flow with OAuth, nor can it specify a first-connect OAuth error state.
