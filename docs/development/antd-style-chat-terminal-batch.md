# antd-style rollout: ChatTerminal preparation

Status: draft, pending Electron acceptance. Base: canary `8af979848`.
Related: #577 and the global rollout candidate #609. This branch is based directly
on canary and does not enable the global switch or include #609's ChatInput changes.

## Changes

Convert `src/features/ChatTerminal/Content.tsx` and `SplitView.tsx` to Tailwind.
The 24px tab height, 4px gap, asymmetric logical padding and normal font weight
now compose with the actual local Tabs primitives through their existing `cn`.
The list retains zero padding, zero radius and a transparent background.

Preserve inactive-pane opacity and close-control reveal on hover/focus-within.
The divider's inline size still reads `DIVIDER_WIDTH` through an inline style,
so the drag math and hit area keep a single source. Its 1px pseudo-element is
centered with logical `calc(50% - 0.5px)`, equivalent to the original
`(DIVIDER_WIDTH - 1) / 2`. Logical block/inline properties remain logical.
Transitions retain their existing properties/durations through arbitrary utilities.

No components, DOM structure, callbacks, session ownership, resize math, store
operations, keyboard handling, theme APIs or strings are changed.
The existing unused `indicator` entry is retained rather than changing dead-code
policy during this migration. The nested close selectors remain descendant
variants; no child is moved. `skeleton: no-change`.

## Counts and retained dependencies

| Check                                               | Base | Candidate |
| --------------------------------------------------- | ---: | --------: |
| antd-style importing files across src/packages/apps | 1305 |      1303 |
| createStaticStyles files across src/packages/apps   |  947 |       945 |
| antd-style importing files within ChatTerminal      |    4 |         2 |
| createStaticStyles files within ChatTerminal        |    2 |         0 |

`TerminalView` still needs concrete theme colors for xterm. `index.tsx` retains
DraggablePanel and its background token. Neither dependency is removed early.
No important modifier, raw color, design token or package dependency is added.

## Verification and merge gates

- Scoped `bun run check` on both source files: lint clean; no related tests selected.
- Explicit existing terminal tests: pane layout, store, keybindings and links;
  42 tests across 4 files passed.
- Supplemental Chromium fixtures: 128 old/new computed-style cases, both themes,
  LTR/RTL, horizontal/vertical writing, real Tabs primitive class composition,
  active/inactive, hover and focus; zero differences. Close reveal is also asserted
  to reach opacity 1 on hover/focus, not merely equal values in both fixtures.
- Independent light review: no actionable findings.
- **未做真机验证**: no Electron app, PTY creation, tab switching or interactive
  divider drag was exercised. Fixtures and unit tests do not prove application
  visual parity. Frontend-owner Electron light/dark checks remain a merge gate.

This is one prerequisite repair, not completion of #577 phase 1. Keep global
rollout #609 draft while the other precedence sites and protected Issue/Settings
work remain unresolved. Do not begin the bulk migration on this evidence alone.
