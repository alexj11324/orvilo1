---
version: alpha
name: Orvilo (Dark)
description: Dark color companion to DESIGN.md. Values below are the default dark output of the local theme generator (src/styles/theme/generate.ts); semantic roles, generation rules and all shared rules are owned by DESIGN.md.
colors:
  # Generated semantic roles (CSS variable names), default dark input.
  primary: '#e7e8e9' # monochrome by default; the chosen accent seed otherwise
  primary-foreground: '#0c0d0f' # near-white fill takes the dark foreground
  success: '#27a644'
  warning: '#f2c94c'
  destructive: '#eb5757'
  info: '#4ea7fc'
  # Text — Linear's measured dark ladder; tertiary lifted to stay AA on selected menu rows
  foreground: '#f7f8f8' # primary text and icons
  muted-foreground: '#d1d6de' # secondary text, labels
  foreground-tertiary: '#91959d' # captions, descriptions, placeholders, icons
  foreground-quaternary: '#62666d' # disabled
  # Surfaces — Linear's measured canvas, panel and menu
  background: '#08090a' # page canvas and sidebar (darkest)
  card: '#0f1011' # primary panel surface
  surface-secondary: '#0b0c0e' # opaque secondary container surface
  popover: '#18191a' # popovers, menus, modals (lifts as it rises)
  # Borders
  border: '#25272a' # stronger hairline
  divider: '#1e1f22' # everyday divider
  input: '#63676c' # control boundary (3:1)
  # Fills are translucent washes of the neutral ink
  fill: 'rgba(246, 249, 254, 0.14)'
  selected: 'rgba(246, 249, 254, 0.09)'
  muted: 'rgba(246, 249, 254, 0.055)' # hover wash
  fill-quaternary: 'rgba(246, 249, 254, 0.025)'
  # Status text roles on dark surfaces
  success-text: '#27a644'
  warning-text: '#f2c94c'
  destructive-text: '#f15c5b'
  info-text: '#4ea7fc'
---

# Orvilo dark colors

[DESIGN.md](DESIGN.md) owns the visual contract, theme choices, generation rules, token architecture, typography, density, spacing, shapes, elevation roles, motion, states, and copy. This file lists the generator's default dark output only; components consume semantic roles through the same Orvilo contract in every library.

The dark canvas, panel, and menu surfaces form distinct depth roles, calibrated to Linear's measured dark product ladder (#08090a, #0f1011, #18191a) with the default `gray` base's faint cool tint. Status fills keep the same seeds as light; their `*-text` roles are re-solved for dark surfaces. The near-white primary fill needs the dark foreground; do not assume white action text. Transparent washes must be evaluated over their actual surface.

Local tooltips retain the inverse `bg-foreground` / `text-background` pair and matching arrow from [Tooltip](src/components/ui/tooltip.tsx). Dialogs take no shadow in dark (`--shadow-dialog: none`); the scrim and the 1px ring define the edge.

The generator's tests prove the contrast floors for every accent and base in dark as well as light (see the [color and accessibility rules](DESIGN.md#component-states-and-accessibility)). They are not evidence of Linear parity or runtime acceptance; capture those on the real product.
