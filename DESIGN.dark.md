---
version: alpha
name: Orvilo (Dark)
description: Dark color companion to DESIGN.md. Existing engine defaults below are reference values; semantic roles and all shared rules are owned by DESIGN.md.
colors:
  # Semantic tokens (orvilo-ui token names). Dark-theme defaults shown.
  colorPrimary: '#eeeeee' # monochrome by default; becomes the chosen primaryColor[9]
  colorSuccess: '#c4f042' # lime (dark uses a brighter hue than light's green)
  colorWarning: '#ffb224' # gold
  colorError: '#f4416c' # red (dark uses red; light uses volcano)
  colorInfo: '#60b1ff' # blue (dark uses blue; light uses geekblue)
  # Text — solid neutrals from the `gray` scale; rank info with these
  colorText: '#ffffff' # primary text and icons
  colorTextSecondary: '#aaaaaa' # secondary text, labels
  colorTextTertiary: '#6f6f6f' # placeholder, captions
  colorTextQuaternary: '#555555' # disabled
  # Surfaces — separate scale from text; never substitute one for the other
  colorBgLayout: '#000000' # page background (darkest)
  colorBgContainer: '#0d0d0d' # primary card / panel surface
  colorBgContainerSecondary: '#070707' # subtle secondary surface (orvilo-ui custom token)
  colorBgElevated: '#1a1a1a' # popovers, menus, modals (lifts as it rises)
  colorBgSpotlight: '#2d2d2d' # retained engine spotlight role; local tooltip is inverse
  # Borders are solid reference defaults; fills are translucent washes
  colorBorder: '#202020' # stronger edge
  colorBorderSecondary: '#1a1a1a' # default divider / subtle border
  colorFill: 'rgba(255, 255, 255, 0.16)'
  colorFillSecondary: 'rgba(255, 255, 255, 0.1)'
  colorFillTertiary: 'rgba(255, 255, 255, 0.06)' # hover wash
  colorFillQuaternary: 'rgba(255, 255, 255, 0.02)' # active wash
---

# Orvilo dark colors

[DESIGN.md](DESIGN.md) owns the visual contract, theme choices, token architecture, typography, density, spacing, shapes, elevation roles, motion, states, and copy. This file supplies the existing dark engine color defaults only; components consume semantic roles through the same Orvilo contract in every library.

The dark canvas, containers, and elevated surfaces form distinct depth roles. Functional colors may use brighter values or different hues from light while preserving their meaning. Near-white primary fill needs the corresponding dark foreground; do not assume white action text. Transparent washes must be evaluated over their actual surface.

Local tooltips retain the inverse `bg-foreground` / `text-background` pair and matching arrow from [Tooltip](src/components/ui/tooltip.tsx). The retained `colorBgSpotlight` value above does not override that pair. Shared shadow roles can resolve to theme-specific values; this companion does not duplicate their tables.

These source reference values are not evidence of contrast, adapter parity, or runtime acceptance. Use the [color and accessibility rules](DESIGN.md#component-states-and-accessibility) to measure rendered foreground/background pairs, including user-selected primary and neutral colors. Current Tailwind variables and the Lobe engine may differ during migration; record the difference and resolve it under [rule ownership](DESIGN.md#rule-ownership).
