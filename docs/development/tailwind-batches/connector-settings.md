# Connector settings Tailwind migration

This #577 batch removes the remaining eleven `antd-style` imports from connector
settings and the shared connector permission detail. It changes class declarations
and icon fill token references only; tool management permissions, OAuth polling,
selection identity, lazy loading, batch updates and lifecycle actions are unchanged.

The two panes retain their 42px headers, 300px sidebar with a 260px minimum,
separate scroll owners and existing overflow behavior. Permission badges retain
4px radius and 12px text. Font-size-only arbitrary forms preserve inherited line
heights; descriptions retain explicit 1.4/1.6 line heights. This does not perform
issue #691's separately approved line-height normalization.

Secondary text, secondary borders, fill and foreground use the existing semantic
roles. Tertiary text and quaternary hover fill retain their precise legacy CSS
variables until #693 supplies equivalent named roles. Brand icons still receive an
explicit foreground fill, not inherited currentColor from a muted row.

Validation: scoped checks and existing related behavior tests, exact Tailwind CSS
compilation, normal commit hooks and one independent light review. Electron
light/dark runtime screenshots remain unavailable; no visual parity is claimed.
