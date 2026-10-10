# Memory primitives: Tailwind migration

Tracking: [#577](https://github.com/alexj11324/orvilo1/issues/577); batch [#636](https://github.com/alexj11324/orvilo1/pull/636).

## Changes

Replace Flexbox/Text with native Tailwind divs and use local Button, confirmModal and toast. Preserve account-session fences, drafts, deletion callbacks, pagination and busy states. Buttons keep 32px height, 13px text, 14px horizontal inset and 6px radius while adopting local outline hover/focus behavior.

The global `ANTD_STYLE_LAYER_ENABLED` switch stays OFF. This batch does not approve a global cascade flip, theme-host removal, or dependency removal. It is independent of the other feature batches and follows integration #630.

## Verification

Implementation revision: `0af5dd61b5a0115d5b1190b50a999f2e3a75911b`. Documentation-only follow-ups leave these source files unchanged.

Scoped lint passed; 3 editor-hook tests passed, including rejected saves notifying through local toast. Independent review found a test mock return-type mismatch, fixed and verified in the single follow-up.

未做真机验证. No new Electron light/dark visual-parity evidence is claimed. The owner instructed that individual environment blockers should be recorded while unaffected work continues; normal CI and merge gates remain in force.

## Remaining dependencies

Markdown remains a specialized LobeHub dependency. Secondary text retains --ant-color-text-description exactly, under the existing temporary-variable rollout permission; owner: frontend owner, #577. This variable is a remaining theme dependency, not permission to remove providers.

`skeleton: no-change`
