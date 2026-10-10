# ResourceHome: Tailwind migration

Tracking: [#577](https://github.com/alexj11324/orvilo1/issues/577); batch [#637](https://github.com/alexj11324/orvilo1/pull/637).

## Changes

Migrate seven files to Tailwind and remove ResourceHome's direct antd-style imports. Preserve native cards, section headings, grids, scroll containers, data flow and NavHeader's inline bottom border. Hover transitions enumerate only the changed border/color/background/shadow properties with the original timing.

The global `ANTD_STYLE_LAYER_ENABLED` switch stays OFF. This batch does not approve a global cascade flip, theme-host removal, or dependency removal. It is independent of the other feature batches and follows integration #630.

## Verification

Implementation revision: `e263244a6f91ba13be7414880862ace3f43f23a5`. Documentation-only follow-ups leave these source files unchanged.

Scoped check on seven explicit file paths: lint clean, 1 related test passed. Independent review verified shadow-variable and transition utility compilation, grid geometry and exact aliases; no findings. The earlier directory selector did not expand and is not counted as verification.

未做真机验证. No new Electron light/dark visual-parity evidence is claimed. The owner instructed that individual environment blockers should be recorded while unaffected work continues; normal CI and merge gates remain in force.

## Remaining dependencies

Retain existing --ant-color-fill-quaternary, --ant-color-text-quaternary, --ant-motion-ease-in-out and --ant-box-shadow-tertiary; owner: frontend owner, #577. These preserve existing values under the temporary-variable rollout permission; they remain theme dependencies.

`skeleton: no-change`
