# Memory tool inspectors: Tailwind migration

Tracking: [#577](https://github.com/alexj11324/orvilo1/issues/577).

Remove all nine direct antd-style imports from the memory tool's Inspector directory. Class composition uses the existing cn utility. Success icons retain their 14px size, minus 2px logical block-end margin and 4px logical start margin through Tailwind, with the existing success semantic color.

Search and taxonomy empty-result text keeps the exact `--ant-color-text-description` value because muted-foreground maps to a different tone. This remains a theme dependency owned by the frontend owner under #577's temporary-variable permission. Preserve all streaming/loading/success conditions, labels, result counts and tool arguments.

Shared inspector and shimmer classes from `@/styles` remain unchanged and still depend on the existing style system. The global cascade flag remains OFF. This batch neither removes providers nor claims the whole memory package is migrated.

## Verification

Scoped checks and independent review are recorded in the PR for the implementation revision. Pure style and class-composition changes do not add source-string CSS tests.

未做真机验证. No Electron light/dark visual parity claim. Individual environment gaps are recorded while independent work continues under the owner's instruction; normal CI and merge gates remain required.

`skeleton: no-change`
