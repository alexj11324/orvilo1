# Goal page and list layouts: Tailwind migration

Tracking: [#577](https://github.com/alexj11324/orvilo1/issues/577).

Migrate six AgentGoals page/list presentation files. Keep all DOM, keyboard navigation, permissions, acceptance-criteria actions, progress calculations, filtering, data requests and portal interactions unchanged. Preserve the inclusive 900px grid breakpoint, four-column progress geometry, logical separators/spacing, hover transforms and original transition properties/durations/easing.

The list-row adjacent-sibling variant applies only between rows carrying the same utility, matching the former generated-class selector. Acceptance criteria retain their not-last-child dashed separators.

## Remaining theme dependencies

Preserve the exact existing `--ant-color-text-tertiary`, `--ant-color-text-quaternary`, `--ant-color-primary-border`, `--ant-color-fill-quaternary`, `--ant-motion-ease-out`, `--ant-border-radius` and `--ant-border-radius-xs` values. They remain theme dependencies under the owner's temporary-variable permission; owner: frontend owner, #577. Runtime-derived radii are not silently replaced with fixed-size roles. Existing foreground/secondary text, success/warning and secondary-border/fill aliases are verified against ThemeRoles.

The global cascade flag stays OFF. Motion declarations use arbitrary properties to preserve the existing policy rather than implicitly applying different global transition utility rules. No shared component, provider, animation keyframes or dependency is removed.

## Verification

Scoped checks and independent review are recorded against the implementation revision in the PR. No source-string CSS tests are introduced.

未做真机验证. Electron light/dark visual parity remains unverified. The owner authorized continuing independent work while recording individual environment gaps; normal CI and merge gates remain required.

`skeleton: no-change`
