# Role class lookup prerequisite

The React skill's [Role → class lookup](../../.agents/skills/react/SKILL.md) is the
implementation reference for the visual roles approved in [DESIGN.md](../../DESIGN.md).
It covers Tailwind v4 variable syntax and the existing layout scale without
introducing a second source of visual values.

The `--text-dense: 13px` variable in `src/app/globals.css` is a font-size-only
alternative for later migrations of `text-[13px]`. Defining it does not change
any component: this prerequisite does not switch call sites or their line heights.

`src/styles/roleClassForms.test.ts` checks how the role forms merge through `cn`
and that the referenced variables exist. The Linear token gate's diagnostic now
links to the lookup; its acceptance rules are unchanged. New and existing component
styling guidance is owned by the React skill, rather than duplicated here.

This prerequisite supports issues #690–#695. The original six-file commit was
checked with `bun run check`, commit hooks, three role-form tests, and six token-gate
tests. Full build, type checking, and the full test suite run in CI. No Electron
verification is required for this unused variable and documentation-only behavior.
