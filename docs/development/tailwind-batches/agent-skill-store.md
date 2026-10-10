# AgentSkillStore: Tailwind migration

Tracking: [#577](https://github.com/alexj11324/orvilo1/issues/577).

Replace the feature's two direct antd-style imports with Tailwind class strings and the existing foreground CSS variable. Keep the style-object exports, DOM, connector permissions, connect/disconnect handlers and loading behavior unchanged.

The grid retains `repeat(2, 1fr)`, 12px gaps and 16px logical padding. The installed antd-style `responsive.sm` means `max-width: 575.98px`; preserve that exact breakpoint rather than substituting Tailwind's differently sized `sm`. Text preserves inherited line height and uses the existing foreground and secondary-text aliases from ThemeRoles.

The global cascade flag stays OFF. No theme providers or dependencies are removed. No pending color aliases or third-party selectors are introduced in this batch.

## Verification

Scoped repository checks and independent review are recorded in the PR against its implementation revision. No source-string CSS tests are added: they would not prove rendering behavior.

未做真机验证. No new Electron light/dark visual-parity evidence is claimed. The owner authorized continuing independent work while recording individual environment gaps; normal CI and merge gates remain required.

`skeleton: no-change`
