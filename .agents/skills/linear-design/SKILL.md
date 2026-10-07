---
name: linear-design
description: 'Use for Linear visual-reference provenance and scoped mapping of live measurements to the approved Orvilo visual contract. Pair with linear-ui-parity for authenticated runtime comparison.'
---

# Linear design reference

## Source and ownership

[`linear-app-DESIGN.md`](linear-app-DESIGN.md) is an archived marketing-site reference from voltagent/awesome-design-md (linear.app). Preserve it as provenance; its raw palette, font suggestions, spacing, and component examples are not authoritative measurements of the authenticated Linear application and do not define Orvilo tokens.

[DESIGN.md](../../../DESIGN.md) owns approved Orvilo visual roles, values, theme mappings, and scoped exceptions. [design-system](../design-system/SKILL.md) owns token architecture and generation guidance. [react](../react/SKILL.md) owns component/import/styling choices. This skill connects reference evidence to those owners; [linear-ui-parity](../linear-ui-parity/SKILL.md) owns collection and acceptance.

## Applying reference evidence

- Measure the live authenticated reference in the agreed route, locale, theme, viewport, and populated state. Record evidence before treating a value as a requirement.
- Map measured surfaces, ink, accent, typography, spacing, radius, and elevation to the applicable DESIGN.md role. The archive's lavender palette and Inter fallback do not mandate project-wide colors or fonts.
- Preserve role-based density and hierarchy. A measured dense UI size (including scoped 13px text) is an exception only in its documented surface; record it in DESIGN.md and the parity inventory rather than normalizing it automatically or promoting it globally.
- Use project semantic tokens through the existing theme mechanism and the mapping contract in DESIGN.md. Do not copy raw reference values into components or create an alternate palette.
- If a current measurement conflicts with the approved role, document the discrepancy and resolve its scope before changing the project contract. An archive or historical audit alone cannot approve a new value.

## Sidebar anatomy (historical reference lead)

Header: workspace name, search, compose. Flat rows included Inbox, My issues, Reviews, Agent, and Drafts; grouped navigation included Workspace and Your teams; a bottom rail included help and avatar. Re-enumerate the live reference before using this as a parity inventory.

Intentional Orvilo contract deltas: **Drafts** stays absent until a real issue-draft domain exists (v5 F38 — no fake entry); **Try** (Initiatives/Cycles) is absent while those products do not exist here. Record their exact affected rows in the parity inventory. Other deltas need explicit scope approval.
