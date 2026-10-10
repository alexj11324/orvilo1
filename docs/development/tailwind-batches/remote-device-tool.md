# Remote device tool: Tailwind migration

Tracking: #577.

Remove five direct antd-style imports from remote device inspectors and cards. Preserve DOM, roles, device labels/scope/details, online/activated indicators, empty states and failed-activation fallback. No permissions, discovery, activation or runtime behavior changes.

Preserve logical spacing, 7px status dots, 32px icon tiles, line heights and non-last row dividers. Use cn for online-dot composition so border-0 overrides the base border, as the previous generated online rule did. Keep runtime Ant radius/font-family values rather than substituting superficially similar local roles.

Retained exact variables: Ant borderRadius/borderRadiusSM/fontFamilyCode, description/quaternary text, success background and warning border/text/background. Mapping owner: frontend owner, #577. Shared inspector/shimmer dependencies remain; global cascade OFF; no new dependencies.

Scoped check and independent review are recorded in the PR. No source-string tests for pure styles. 未做真机验证: no Electron light/dark visual-parity claim or device-runtime acceptance claim.

`skeleton: no-change`
