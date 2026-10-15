# Vendor styles and CSS layers

Orvilo's own UI is ReUI/shadcn on Tailwind v4 and the local theme generator
(`src/styles/theme/generate.ts`). The antd retirement (see
[antd-retirement-plan.md](./antd-retirement-plan.md)) removed every first-party use of
`antd`, `antd-style`, `@ant-design/cssinjs` and `@lobehub/ui`. Three vendor packages
still render LobeHub components at runtime:

- `@lobehub/editor` (rich-text editor, renderer, CodeMirror pane),
- `@lobehub/charts` (usage charts and model rating radars),
- `@lobehub/icons` (brand icons; it uses the lobehub `Flexbox`/`Center` and inline
  `cssVar.*` colours, but no provider context).

Anything **unlayered** beats anything inside an `@layer`, whatever the specificity, and
Tailwind v4 keeps `base`, `components` and `utilities` in layers. So every rule those
packages inject has to sit in a layer below Tailwind, and its selectors must not reach
first-party markup.

## The vendor host: `src/components/LobeThemeScope`

Every component that renders `@lobehub/editor` or `@lobehub/charts` output wraps it in
`LobeThemeScope`. Nested scopes collapse into the outermost one, so leaf components can
wrap freely (the chat composer has one scope around the editor, toolbar and actions).
The scope renders:

| Piece                                                                             | Why                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@ant-design/cssinjs` `<StyleProvider layer>`                                     | antd cssinjs (components that `@lobehub/ui` builds on, the `a:where(.css-…)` link reset) goes into `@layer antd`.                                                                                                               |
| lobehub `ConfigProvider` (motion, UI strings, `aAs`/`imgAs`)                      | Vendor components read motion and i18n from it. UI strings are lobehub's built-ins merged under `locales/<lang>/ui.json`.                                                                                                       |
| lobehub `ThemeProvider`, `enableGlobalStyle={false}`, `enableCustomFonts={false}` | antd-style context for `useThemeMode`/`useTheme`; antd token from `generateEngineToken(generateTheme(...))` of the nearest `ThemeRoles` host.                                                                                   |
| the antd `App` root, given `.orvilo-editor-scope` and `display: contents`         | No layout box. Its own font/colour defaults are reset to `inherit` so the host container keeps control of text.                                                                                                                 |
| `editorScopeCss()` (`<style href precedence>`)                                    | The `--ant-*` aliases, defined on `.orvilo-editor-scope` only and pointing at local roles. The document root has no `--ant-*`.                                                                                                  |
| `#lobe-ui-theme-app` and the `[data-lobe-portal-host]` element                    | `useAppElement()` returns that host, and the editor's toolbars and slash menu query `LOBE_THEME_APP_ID`. Popovers, dropdowns, selects, image previews and toasts therefore portal **inside** the scope and inherit its aliases. |
| lobehub `ToastHost`                                                               | The editor calls lobehub `toast` (link copied, Markdown paste hint). Only one host is active at a time.                                                                                                                         |

`src/components/LobeThemeScope/**` (plus the precompiler runtime
`plugins/vite/staticStylesRuntime.js` and `src/styles/layerEmotionCache.test.ts`) is the
only code allowed to import the retired packages. `eslint.config.mjs` enforces it as an
error and `src/antdRetirementRatchet.test.ts` fails if any other file imports them or
writes `--ant-*`.

## Emotion: layered and scoped

antd-style (`createStaticStyles`, `createStyles`, `cx`, `createGlobalStyle`) writes through
emotion, not cssinjs, so `StyleProvider layer` does not touch it.
`src/components/LobeThemeScope/installStyleLayer.ts` patches antd-style's shared emotion
cache (`src/styles/layerEmotionCache.ts`):

- class rules become `@layer antd-style{:where(.orvilo-editor-scope) .css-x{…}}`. The
  scope prefix adds no specificity, and a nested vendor rule such as `.css-x hr` can only
  match inside a scope;
- selector-less fragments (keyframes, `createGlobalStyle` sheets such as lobehub's
  `EssentialStyle`) are layered but not scoped.

The patch must run before any vendor module evaluates `createStaticStyles`, so it is the
first import of `src/initialize.ts` (all SPA entries) and of the Share and Workbench
`entry.client.tsx`. It warns in the console if it ever runs late. The Vite precompiler
(`plugins/vite/staticStylesPrecompile.ts`, enabled by `ANTD_STYLE_LAYER_ENABLED`) bakes the
same layer and scope into `@lobehub/ui` rules compiled at build time.

## Layer order

`src/app/globals.css` starts with

```css
@layer theme, base, antd, antd-style, components, utilities;
```

before every `@import`; a runtime layer that is not declared there would be created after
`utilities` and beat it. lobehub's `lobe-base` / `lobe-popup` layers now nest inside
`antd-style`. `src/components/LobeThemeScope/index.test.ts` locks the order.

## Global vendor selectors that remain

The layered-but-unscoped global sheets still contain global selectors. All of them sit in
`@layer antd-style`, below every Tailwind utility:

| Rule                                                        | Source                   | Notes                                                                                                                               |
| ----------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `:root { --lobe-ring }`                                     | lobehub `EssentialStyle` | A variable only; no first-party code reads it.                                                                                      |
| `:where(.lobe-flex)` defaults, `.lobe-brand-loading path`   | lobehub `EssentialStyle` | `.lobe-flex` is also defined in `globals.css` (same layer) because `@lobehub/icons` lays out its avatars with it outside any scope. |
| `.ant-btn`, `.ant-tooltip`, `.ant-checkbox-inner` overrides | lobehub `antdOverride`   | Match antd markup only; first-party code renders none.                                                                              |
| `@keyframes …`                                              | emotion                  | Names are hashed.                                                                                                                   |
| lobehub `GlobalFocusRing`                                   | `ConfigProvider`         | Attribute-scoped popover focus ring, installed when the first scope mounts.                                                         |

## What else changed

- The app shells (`AppTheme`, `AuthThemeLite`, `ShareTheme`, `WorkbenchTheme`) and the
  router error boundary no longer mount any lobehub/antd provider. `AppTheme` renders a
  plain root (`data-orvilo-app-root`, `isolation: isolate`); Share and Workbench mount the
  repo-owned `BaseGlobalStyle` reset that the vendor `GlobalStyle` used to provide.
- antd `ConfigProvider` locale/direction is gone: `useDocumentDirection` sets `<html dir>`
  from the active language, and dates use dayjs.
- `antd/dist/reset.css`, `AntdStyleLayer`, the SSR `extractStaticStyle` /
  `buildInlineAntdStyle` collection, `lobeStaticCssPlugin`, the `antd-*.css` /
  `theme-vars-*.css` static bundles and `emit-static-css.mjs` are deleted.
- The CDN webfonts the vendor `ThemeProvider` used to load (`enableCustomFonts`) are loaded
  by `src/components/CdnWebFonts`; KaTeX CSS is bundled by `src/components/Markdown`.

## Risks and checks still needed in the running app

- A scope inside a transformed or `overflow: hidden` ancestor: its fixed portal host is
  then positioned relative to that ancestor. Editor menus were previously portaled at the
  app root.
- With several scopes on a page, the editor's `LOBE_THEME_APP_ID` lookups resolve to the
  first one in document order. Colours match (all scopes share the same aliases), but
  clipping follows that scope's ancestors.
- A vendor rule of the form `.ancestor &` only matches when `.ancestor` is outside the
  scope.
- `@lobehub/icons` default avatars rendered outside a scope colour themselves with
  `cssVar.colorFillSecondary` / `colorTextDescription`, which are now undefined there and
  fall back to transparent / inherited colour.
- Verify in Electron, light and dark: chat composer (slash menu, mention list, toolbar,
  link toast), page editor (block menu, floating toolbar, image preview, table menu),
  usage charts and model radar, and that the document root computes no `--ant-*` and no
  unlayered vendor rule matches outside `.orvilo-editor-scope`.
