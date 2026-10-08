# antd global styles and CSS layers

Orvilo components are ReUI/shadcn, but antd and `@lobehub/ui` still inject global
CSS at runtime. Anything **unlayered** beats anything inside an `@layer` (Tailwind
v4 puts `base`, `components` and `utilities` in layers), whatever the specificity.
So shadcn utilities such as `transition-none`, `outline-hidden` or a hidden
scrollbar lost to host rules, and components worked around it one by one
(for example `hostStyles` in `SidebarShell.tsx`, PR #561).

## Where each rule comes from

| Rule                                                                                             | Source                                                                                                                                                                                                                                   | Layered now?                                                                                                            |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `a { color: link; transition: color <motion-slow>; outline: none }` and `a:hover/:active/:focus` | antd `style/index` `genLinkStyle`, emitted by cssinjs `getResetStyles` (`theme/util/genStyleUtils`) as `a:where(.css-hash)` once any antd component renders. `<motion-slow>` is `motionUnit * 3`; `motionUnit 0.05` (agile) gives `0.2s` | Yes: `<StyleProvider layer>` puts it in `@layer antd`                                                                   |
| `a:focus-visible { outline: 2px solid colorPrimaryBorder }`                                      | same (`genFocusStyle`)                                                                                                                                                                                                                   | Yes, same                                                                                                               |
| antd component CSS (`.ant-btn`, Form, ...)                                                       | antd cssinjs                                                                                                                                                                                                                             | Yes, `@layer antd`                                                                                                      |
| `antd/dist/reset.css`                                                                            | `globals.css` import                                                                                                                                                                                                                     | Already `layer(base)`                                                                                                   |
| `* { scrollbar-width: thin; scrollbar-color; box-sizing; vertical-align: baseline }`             | `@lobehub/ui` `ThemeProvider/GlobalStyle/global` (emotion `createGlobalStyle`)                                                                                                                                                           | Yes: copied to `src/styles/baseReset.ts`, `*` inside `@layer base`; lobehub's disabled with `enableGlobalStyle={false}` |
| `* { scrollbar-*; ::-webkit-scrollbar }`                                                         | `src/styles/global.ts`                                                                                                                                                                                                                   | Yes, `@layer base`                                                                                                      |
| `html`, `body`, `code`, `::selection`                                                            | lobehub `GlobalStyle`                                                                                                                                                                                                                    | Copied to `baseReset.ts`, **still unlayered** on purpose (see below)                                                    |
| `html, body, #__next` sizing, `button { -webkit-app-region }`, popup highlight rules             | `src/styles/global.ts`                                                                                                                                                                                                                   | Unlayered on purpose                                                                                                    |
| `:root --lobe-ring`, `@layer lobe-base`, `@layer lobe-popup`                                     | lobehub `EssentialStyle` (not gated by `enableGlobalStyle`)                                                                                                                                                                              | Already layered; their order is unchanged (declared after `utilities`)                                                  |
| `AppTheme.styles.scrollbar`                                                                      | `AppTheme.tsx`                                                                                                                                                                                                                           | Scoped to the app root class, not global                                                                                |
| `@lobehub/ui` `GlobalFocusRing`                                                                  | attribute-scoped popover                                                                                                                                                                                                                 | Not a global rule                                                                                                       |

antd-style (`createStaticStyles`, `createStyles`, `createGlobalStyle`) is **not** cssinjs: it
goes through emotion (`createCSS`/`createEmotion`; no `useStyleRegister` in `antd-style/es`).
So `StyleProvider layer` does not touch the \~1100 files that use it, and those
classes keep overriding antd.

## What changed

1. `src/app/globals.css` starts with `@layer theme, base, antd, components, utilities;`.
   It must precede every `@import`. Without it the runtime `antd` layer would be created
   after `utilities` and beat Tailwind. Checked with `@tailwindcss/postcss`: the statement
   survives and the compiled order is `properties, theme, base, antd, components, utilities`.
2. `AntdStyleLayer` (`@ant-design/cssinjs` `StyleProvider layer`) wraps the lobehub
   `ThemeProvider` in `AppTheme` and `AuthThemeLite`. **It must sit above the ThemeProvider**:
   ThemeProvider renders antd `<App>`, and any antd component outside the provider registers an
   unlayered copy of the `a` reset. `@ant-design/cssinjs` is now a root dependency (same
   range as `apps/*`); antd-style's own `StyleProvider` has no typed `layer` prop.
3. `ThemeProvider enableGlobalStyle={false}` plus `BaseGlobalStyle`, so the universal `*` rule can be
   layered. It is rendered before `GlobalStyle` to keep the old injection order.
4. `global.ts` scrollbar reset moved into `@layer base`.

`html`/`body`/`code`/`::selection` stay unlayered because `globals.css` has
`@layer base { body { @apply bg-background text-foreground } }` and repo `global.ts` relies on
winning over lobehub's `body { min-height: 100vh }`. Layering them would flip those winners.

## Risks

- `* { vertical-align: baseline }` is the reason `*` had to be layered too: unlayered, it
  would override antd's own `vertical-align` (31 antd style files, including Form and `.anticon`)
  as soon as antd moved into a layer.
- antd `!important` declarations now live in a layer; layered `!important` beats unlayered
  `!important`. About 30 declarations, all inside specific components (Input/Textarea box-shadow,
  Alert margin, Table, Menu, Slider).
- Tailwind classes on antd-rendered elements now win (intended). 21 files import from `antd`
  directly (4 pass utility classes); about 300 import `@lobehub/ui`, some of which wrap antd.
- `baseReset.ts` is a copy of lobehub 5.56.0 `ThemeProvider/GlobalStyle/global.mjs`, identical
  except for the layered `*` rule. Diff it again when upgrading `@lobehub/ui`.
- Not done: `apps/auth|share|workbench` have their own cssinjs cache in `entry.server.tsx`; enabling
  `layer` there needs matching SSR extraction. Follow-up.
- Not visually verified: needs an Electron run (sidebar, Form pages, auth pages).

## Why antd cannot be deleted yet

- `antd-style` is imported by \~1100 files for `createStaticStyles`/`cssVar` and peers on antd.
- `@lobehub/ui` (\~300 importing files) depends on antd and on the antd-style theme.
- Direct imports remain: `Form`/`FormInstance` (GroupForm validation), `ConfigProvider`, `App`, `theme`.

Prerequisites, in order:

1. Move `createStaticStyles` call sites to Tailwind or CSS variables (drop `cssVar` from antd-style).
2. Replace the retained `@lobehub/ui` components with local ones, or accept it as a leaf dependency.
3. Replace the `GroupForm` validation layer (antd `Form`) with a form library on the ReUI field primitives.
4. Remove `ConfigProvider`/`App`/`theme` and the lobehub `ThemeProvider`; then antd, antd-style and `AntdStyleLayer` go.

## Overrides that become removable

After this ships, `hostStyles` in `SidebarShell.tsx` (PR #561) no longer needs:
`text-decoration: none`, the `transition-property` overrides, the transparent `:focus-visible`
outline, and the `[data-sidebar='content']` `scrollbar-color` pair (the thin-scrollbar `*` rule is layered).
The anchor `color` declarations probably go too (the link colour rule is layered); confirm after an
Electron check. Background and icon opacity rules are visual design, keep them.
