# antd global styles and CSS layers

Orvilo components are ReUI/shadcn, but antd and `@lobehub/ui` still inject global
CSS at runtime. Anything **unlayered** beats anything inside an `@layer` (Tailwind
v4 puts `base`, `components` and `utilities` in layers), whatever the specificity.
So shadcn utilities such as `transition-none`, `outline-hidden` or a hidden
scrollbar lost to host rules, and components worked around it one by one
(for example `hostStyles` in `SidebarShell.tsx`, PR #561).

## Where each rule comes from

| Rule                                                                                             | Source                                                                                                                                                                                                                                   | Layered now?                                                                                                    |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `a { color: link; transition: color <motion-slow>; outline: none }` and `a:hover/:active/:focus` | antd `style/index` `genLinkStyle`, emitted by cssinjs `getResetStyles` (`theme/util/genStyleUtils`) as `a:where(.css-hash)` once any antd component renders. `<motion-slow>` is `motionUnit * 3`; `motionUnit 0.05` (agile) gives `0.2s` | Yes: `<StyleProvider layer>` puts it in `@layer antd`                                                           |
| `a:focus-visible { outline: 2px solid colorPrimaryBorder }`                                      | same (`genFocusStyle`)                                                                                                                                                                                                                   | Yes, same                                                                                                       |
| antd component CSS (`.ant-btn`, Form, ...)                                                       | antd cssinjs                                                                                                                                                                                                                             | Yes, `@layer antd`                                                                                              |
| `antd/dist/reset.css`                                                                            | `globals.css` import                                                                                                                                                                                                                     | Already `layer(base)`                                                                                           |
| `* { scrollbar-width: thin; scrollbar-color; box-sizing; vertical-align: baseline }`             | Repo-owned native `BaseGlobalStyle` document reset consuming existing ThemeRoles                                                                                                                                                         | Yes: `src/styles/baseReset.ts` places document defaults in `@layer base`; lobehub's global reset stays disabled |
| `* { scrollbar-*; ::-webkit-scrollbar }`                                                         | `src/styles/global.ts`                                                                                                                                                                                                                   | Yes, `@layer base`                                                                                              |
| `html`, `body`, `code`, `::selection`                                                            | lobehub `GlobalStyle`                                                                                                                                                                                                                    | Repo-owned `baseReset.ts` defaults in `@layer base` (see below)                                                 |
| `html, body, #__next` sizing, `button { -webkit-app-region }`, popup highlight rules             | `src/styles/global.ts`                                                                                                                                                                                                                   | Unlayered on purpose                                                                                            |
| `:root --lobe-ring`, `@layer lobe-base`, `@layer lobe-popup`                                     | lobehub `EssentialStyle` (not gated by `enableGlobalStyle`)                                                                                                                                                                              | Already layered; their order is unchanged (declared after `utilities`)                                          |
| `AppTheme.styles.scrollbar`                                                                      | `AppTheme.tsx`                                                                                                                                                                                                                           | Scoped to the app root class, not global                                                                        |
| `@lobehub/ui` `GlobalFocusRing`                                                                  | attribute-scoped popover                                                                                                                                                                                                                 | Not a global rule                                                                                               |

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
3. `ThemeProvider enableGlobalStyle={false}` plus native `BaseGlobalStyle` places the document
   defaults in `@layer base`. Its existing AppTheme/AuthThemeLite call positions stay unchanged.
   The sheet consumes current ThemeRoles font, surface, text, primary/on-fill and scrollbar roles.
4. `global.ts` scrollbar reset moved into `@layer base`.

`html`/`body`/`code`/`::selection` now join the universal reset in `@layer base`. This allows the
application's unlayered viewport rules (`100dvh`, overflow, and desktop wash) and explicit
component/font utilities to win even when the native reset style is rendered in the body.
The document defaults use 14/22 body typography and the existing foreground/background
roles; selected text uses the chosen-primary fill and its paired foreground. These are
intentional role/priority changes, not CSS equivalence with the old vendor reset. The
code defaults still use the resolved monospace role; forced font priorities are removed
in favour of explicit public SDK/local component styles. Native selection paint, mixed SDK
font cascade, first paint and SSR/hydration require actual runtime evidence.

## Risks

- `* { vertical-align: baseline }` is the reason `*` had to be layered too: unlayered, it
  would override antd's own `vertical-align` (31 antd style files, including Form and `.anticon`)
  as soon as antd moved into a layer.
- antd `!important` declarations now live in a layer; layered `!important` beats unlayered
  `!important`. About 30 declarations, all inside specific components (Input/Textarea box-shadow,
  Alert margin, Table, Menu, Slider).
- Tailwind classes on antd-rendered elements now win (intended). 21 files import from `antd`
  directly (4 pass utility classes); about 300 import `@lobehub/ui`, some of which wrap antd.
- `baseReset.ts` retains the document reset properties but is a native React style sheet, not
  a byte-equivalent copy of the vendor global reset. It relies on the existing document
  ThemeRoles host for live fonts/colors; do not re-enable the vendor global reset or silently
  restore the old unlayered/important defaults when upgrading `@lobehub/ui`.
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
