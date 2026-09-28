---
name: linear-design
description: Linear's design tokens (color surfaces, hairlines, typography scale, spacing, radius, accent usage) distilled from linear.app. Use when aligning Orvilo work surfaces (sidebar, inbox, my-issues, reviews, views, teams) to Linear's visual language or judging whether a screen "looks Linear".
---

# Linear design reference

Source: `linear-app-DESIGN.md` in this directory (voltagent/awesome-design-md, linear.app). Read it for the full token tables — this file holds the decision rules.

## When this applies

Any UI change whose goal is Linear parity (navigation-attention PR surfaces, sidebar IA, list/board density) must be checked against these tokens before shipping. Do not invent greys, radii, or tracking — map to the nearest Linear token.

## Hard rules

- **Surfaces, not shadows.** Hierarchy comes from the 4-step surface ladder (`canvas #010102 → surface-1 #0f1011 → surface-2 #141516 → surface-3 #18191a → surface-4 #191a1b`) plus 1px hairlines (`#23252a` / `#34343a` / `#3e3e44`). Never add drop shadows to fake elevation; in light mode use the same ladder logic (theme tokens already invert).
- **One accent only.** Lavender-blue `#5e6ad2` (hover `#828fff`, focus `#5e69d1`) is the single chromatic accent — primary CTA, focus ring, active nav state. In Orvilo map to the theme's primary color token, never a raw hex. No decorative color; semantic colors only for real status.
- **Radius discipline.** Cards/menus `8–12px` (`rounded.md`/`lg`), rows/chips `4–6px`, pill only for true pills (tabs, status badges). Linear never mixes pill rows with square cards.
- **Density.** Sidebar rows are 28px, text `body-sm` 14px (labels) / `caption` 12px (counts, meta); section labels `eyebrow` 13px medium with `+0.4px` tracking; row counts right-aligned in `ink-subtle`. Headline tracking is negative and scales with size — app UI uses `body`/`body-sm`/`caption`, not display sizes.
- **Spacing.** Grid in 4px units (`xxs 4 / xs 8 / sm 12 / md 16 / lg 24`). Sidebar section gap = `xs`; row horizontal padding = `xs`; icon-to-label = `xs`.
- **Type voice.** UI text = Inter/system sans mapped to Linear Text: weight 400 body, 500 labels/buttons, 600 only for page titles. Mono only for IDs/keys.

## Sidebar anatomy (Linear reference)

Header: `WorkspaceName ⌄` + search + compose icons. Flat rows: Inbox·count / My issues / Reviews·count / Agent / Drafts·count. Then a standalone `+` quick-create row. Then accordions: Workspace (Projects / Views / Members / More), Your teams (each team → Home / Issues / Projects / Views), Try. Bottom rail: `?` help + avatar.

Orvilo contract deltas that are intentional (do not "fix"): **Drafts** stays absent until a real issue-draft domain exists (v5 F38 — no fake entry); **Try** (Initiatives/Cycles) absent — those products don't exist here.
