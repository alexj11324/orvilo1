# Hover wash uses the accent role, not muted

`--muted` is the secondary surface (near black in the dark theme), while `--accent` maps to `colorFillTertiary`, the hover wash DESIGN.md defines. Interactive states (hover, focus-visible, expanded, popup-open, active) that painted `bg-muted` went darker than the surface in dark mode and did not match controls using the antd fill tokens beside them. The ghost and outline Button variants and the remaining interactive `bg-muted` states now use `bg-accent`; static `bg-muted` surfaces are unchanged.
