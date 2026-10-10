# Web search surfaces: Tailwind migration

Tracking: [#577](https://github.com/alexj11324/orvilo1/issues/577).

Migrate eleven simple web-search presentation files: three inspectors, search configuration layout, query/results/show-more cards, shared search controls and category/engine avatars. Keep all DOM, query/filter state, request payloads, loading conditions, labels and desktop external-link handling unchanged. This is a style migration only; no form validation library is added.

Preserve logical padding, 12px text with inherited line height, existing initial card text color, avatar colors and dimensions. Class composition uses cn; unchanged shimmer classes remain opaque and are used alone in their spans. The config layout's existing caller does not add competing generated classes.

## Remaining dependencies

Retain exact `--ant-color-text-description`, `--ant-color-text-tertiary` and `--ant-color-fill-content` variables under the owner's temporary-variable permission; owner: frontend owner, #577. Existing secondary text, layout background and tertiary fill use their exact ThemeRoles aliases.

The placeholder animation, page-content styles and complex Portal result overrides remain separate work. No shared shimmer/highlight rule, animation, provider or dependency is removed. The global cascade flag stays OFF.

## Verification

Scoped checks and independent review are recorded against the implementation revision in the PR. Pure styles do not add source-string CSS tests.

未做真机验证. No Electron light/dark visual parity is claimed. The owner authorized advancing independent work while documenting individual environment gaps; normal CI and merge gates remain required.

`skeleton: no-change`
