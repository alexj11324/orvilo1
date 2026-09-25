# Project overview: members and updates

Captured on 2026-09-22 from Linear in Chrome at 1600 x 1002 and Orvilo in
Electron at 1600 x 900. The reference was inspected read-only: the existing
empty Add link dialog was cancelled only after both fields were verified empty;
no project, member, document, link, or update was created, changed, or removed.

## Evidence

- Linear overview with empty members and updates: local-only capture at
  `/tmp/orvilo-project-overview-reference.png` (not committed because it contains
  real project data).
- Orvilo overview with a member and update: local-only capture at
  `/tmp/orvilo-project-overview-local.png` (not committed because it contains
  real member and project data).
- Reference project: `Orvilo Linear Parity`.
- Orvilo fixture: `Wave2 Verify Project` (the open Add link dialog and browser
  validation bubble belong to separate verification work and were not operated
  during this capture).

## Observed component contract

### Members

- In the captured empty-members reference, the inline Properties summary did
  not show a Members trigger; the right-hand Properties card did.
- The empty Members property row is `362 x 28` at `(1208, 245)`.
- Its `Add members` trigger is `115.984 x 28` at `(1298, 245)`, transparent,
  borderless, with a pill radius and `13.333px / 400` computed text. It includes
  the members icon and left/right padding of 6px.
- Orvilo's populated fixture rendered the persisted member in both the inline
  summary and the right card. Each multiple-select trigger was
  `187.72 x 28`, transparent/borderless, radius 8px, `13px / 400`, gap 8px,
  padding `0 8px`, and displayed `AT Agent Testing User`.

The `Agent Testing User` record is real fixture data. It is both a project
member and the author of the observed update. Parity must not delete it, alter
membership, or hide its name merely to resemble an empty reference. The user
also explicitly confirmed that Linear shows Members in the top Properties row
when members exist. Therefore the empty capture cannot be generalized to the
non-empty layout, and this slice preserves both existing Members controls and
their behavior.

### Updates

- All six existing reference projects were inspected from the existing Projects
  list. Every project showed `No updates`, and every loaded overview showed the
  empty action `Write first project update`.
- Main-agent recapture on 2026-09-22 at
  `/acp-harness-.../overview` (1600 x 1002) established that the empty state is
  two distinct surfaces, not one full-panel button:
  - The button's grandparent `DIV` is `837 x 66`, `display: flex`,
    `justify-content: center`, `padding: 16px`, border
    `1px solid lch(88.49 0 282)`, and radius `10px`.
  - The inner `BUTTON` measures `200.734 x 32` for the English reference, `font-size: 13px`,
    `font-weight: 500`, `line-height: normal`, padding
    `0 12px 0 10px`, border `1px solid transparent`, and radius `9999px`.
  - The intermediate wrapper, icon geometry, element gap, hover, focus and
    activated state were not supplied by this recapture and remain unknown.
- Orvilo's collapsed action was approximately `800 x 36` and read
  `Write a project update…`. On the populated fixture it was followed by the
  persisted update author, health, and body in the Overview content column.
- Comments are not project updates and remain excluded from Overview. The
  Activity page owns the complete chronological activity stream and continues
  to use the shared `ProjectUpdateRow`.

Matched CSS rules additionally confirmed content-driven width (no fixed width),
`min-width: 32px`, `height: 32px`, `white-space: nowrap` and centered content.
The measured English width is not a fixed dimension to impose on other locales.

The evidence-backed empty-state fix is a 66px bordered container holding the
32px first-update button with the observed copy. Existing non-empty rendering
and persistence remain intact because the corresponding Linear state was
unavailable. An unresolved SWR response is an unknown state, not evidence that
the update list is empty.

## Observed and unobserved states

| State                      | Reference evidence                                          | Scope decision                                                        |
| -------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------- |
| Empty Members              | Observed                                                    | Record only; do not infer the non-empty layout.                       |
| One or more Members        | **Not observed** after inspecting all six existing projects | Preserve existing fields and names; user confirms top Members exists. |
| No published update        | Observed on all six projects                                | Match the 66px centered first-update CTA.                             |
| Updates request unresolved | **Not an empty-state observation**                          | Keep the normal update entry; do not show first-update copy.          |
| One published update       | **Not observed**                                            | Preserve current truthful rendering.                                  |
| Multiple published updates | **Not observed**                                            | Do not infer truncation or ordering from an empty reference.          |
| Update comments            | Not shown on Overview                                       | Keep excluded; Activity remains the complete stream.                  |

## Data roles and interaction

- Project membership is persisted independently of the project lead and update
  author. Both existing Overview Members controls remain available.
- Selecting or removing a member continues through the existing project member
  actions. Read-only users continue to receive a disabled trigger.
- Activating the empty update panel continues to navigate to Activity with the
  project-update composer requested. No second mutation path is introduced.
- Main-agent read-only verification on 2026-09-22 confirmed the click journey
  in both products: Overview navigates to Activity with the Update tab selected
  and an empty editor; no update was published. Linear's enabled Post update
  action also had a project-change summary while the local action was disabled
  without that summary, so button enablement must not be copied independently
  of the missing summary/domain behavior. This remains a separate ORV-125 gap
  and is not whole-flow visual acceptance.
- Update creation, update rows, comments, and Activity routing remain shared
  with the existing Updates/Activity implementation.

## Delta inventory

- Preserve: inline and right-card Members controls pending a populated Linear
  reference; the user explicitly confirmed the top Members location exists.
- Change: confirmed-empty update container and inner button structure, sizing,
  border/radius, weight and first-update wording.
- Preserve: persisted member names, update author,
  health/body, update mutation, comments filter, and Activity behavior.
- Not present in the reference empty state: a list of update rows.
- Not verified: visual form of a non-empty Linear Members trigger or published
  Linear update. These require a future read-only reference project containing
  those states before claiming visual parity.

## Acceptance boundaries

- **Structure:** existing inline and right-card Members fields remain; the empty
  update panel remains in the main column.
- **Visual:** confirmed-empty state uses a 66px bordered/radius-10 container and
  a centered 32px pill button with the measured typography and padding; empty
  Members dimensions are recorded above. Unknown/non-empty states are not
  claimed.
- **Interaction:** existing Members CRUD remains available; the update CTA still
  opens Activity's update composer.
- **Persistence:** no schema/API change; project membership and updates continue
  through the existing services and SWR invalidation.
