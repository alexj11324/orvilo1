---
version: alpha
name: Orvilo
description: Orvilo's visual contract. Existing light theme values below are reference defaults; DESIGN.dark.md supplies dark color values. Runtime adapters must implement the same semantic roles.
themeable:
  # Users pick a primary and a neutral; components must read the semantic tokens
  # below rather than hard-coding any single value from this list.
  primaryColor:
    default: ~ # monochrome (near-black in light) when unset — see colorPrimary
    options:
      [red, orange, gold, yellow, lime, green, cyan, blue, geekblue, purple, magenta, volcano]
  neutralColor:
    default: ~ # the built-in `gray` scale when unset
    options: [mauve, slate, sage, olive, sand]
colors:
  # Existing engine token names for Orvilo semantic roles; light reference defaults
  # `cssVar.colorPrimary`, `cssVar.colorText`, etc. Light-theme defaults shown.
  colorPrimary: '#222222' # monochrome by default; becomes the chosen primaryColor[9]
  colorSuccess: '#379d4a' # green
  colorWarning: '#ee9e0b' # gold
  colorError: '#ec5e41' # volcano
  colorInfo: '#0072f5' # geekblue
  # Text — solid neutrals from the `gray` scale; rank info with these
  colorText: '#080808' # primary text and icons
  colorTextSecondary: '#666666' # secondary text, labels
  colorTextTertiary: '#999999' # placeholder, captions
  colorTextQuaternary: '#bbbbbb' # disabled
  # Surfaces — separate scale from text; never substitute one for the other
  colorBgLayout: '#f8f8f8' # page background
  colorBgContainer: '#ffffff' # primary card / panel surface
  colorBgContainerSecondary: '#fbfbfb' # subtle secondary surface (orvilo-ui custom token)
  colorBgElevated: '#ffffff' # popovers, menus, modals
  colorBgSpotlight: '#dddddd' # retained engine spotlight role; not the local tooltip contract
  # Borders are solid reference defaults; fills are translucent washes
  colorBorder: '#e3e3e3' # stronger edge
  colorBorderSecondary: '#eeeeee' # default divider / subtle border
  colorFill: 'rgba(0, 0, 0, 0.12)'
  colorFillSecondary: 'rgba(0, 0, 0, 0.06)'
  colorFillTertiary: 'rgba(0, 0, 0, 0.03)' # hover wash
  colorFillQuaternary: 'rgba(0, 0, 0, 0.015)' # active wash
elevation:
  # Shared elevation roles; light reference values, dark values may differ
  boxShadowTertiary: '0 3px 1px -1px rgba(26, 26, 26, 0.06)' # raised cards
  boxShadowSecondary: '0 8px 16px -4px rgba(0, 0, 0, 0.2)' # popovers, menus
  boxShadow: '0 20px 20px -8px rgba(0, 0, 0, 0.24)' # modals, dialogs
typography:
  fontFamily: 'Geist, -apple-system, BlinkMacSystemFont, "Segoe UI Variable Display", "Segoe UI", Roboto, "Helvetica Neue", Arial, "HarmonyOS Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", "Microsoft YaHei", ui-sans-serif, system-ui, sans-serif'
  fontFamilyCode: '"Geist Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, "Cascadia Code", Consolas, "HarmonyOS Sans SC", monospace'
  # Body & label scale (orvilo-ui)
  fontSizeSM: 12 # captions, dense metadata
  fontSize: 14 # default body and UI text
  fontSizeLG: 16 # emphasis, large controls
  fontSizeXL: 20
  lineHeight: 1.5714 # ~22px at 14px
  lineHeightSM: 1.6667 # ~20px at 12px
  # Headings
  fontSizeHeading1: 38
  fontSizeHeading2: 30
  fontSizeHeading3: 24
  fontSizeHeading4: 20
  fontSizeHeading5: 16
  fontWeightStrong: 600
spacing:
  # 4px base scale (orvilo-ui padding/margin tokens)
  XXS: 4
  XS: 8
  SM: 12
  base: 16
  MD: 20
  LG: 24
  XL: 32
radius:
  borderRadiusXS: 4 # tags, chips
  borderRadiusSM: 6 # inputs, small controls
  borderRadius: 8 # default — buttons, cards
  borderRadiusLG: 12 # menus, modals, large surfaces
controls:
  controlHeightSM: 28
  controlHeight: 36 # default (orvilo-ui base)
  controlHeightLG: 40
---

# Orvilo

Orvilo is calm and content-first: restrained color, clear hierarchy, and space for the user's work. Color communicates meaning. Natural, Meaningful, Certainty, and Growth guide the product; their definitions and interaction priorities live in [UX design values](.agents/skills/ux/references/design-values.md).

## Rule ownership

This file is the single Orvilo visual contract for both appearances. [DESIGN.dark.md](DESIGN.dark.md) supplies dark color defaults only. The YAML above retains the existing light engine values as reference defaults, not a second palette or proof of accessibility.

| Concern                                                                                    | Owner                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visual roles, type, density, spacing, shape, elevation, motion, copy tone                  | This document                                                                                                                                                                                                                                                                               |
| Component/import priority, styling APIs, state locality, render boundaries                 | [React skill](.agents/skills/react/SKILL.md) and its [layout reference](.agents/skills/react/references/layout-kit.md)                                                                                                                                                                      |
| Empty/loading/error behavior, recovery, selection, actions, drafts, progressive disclosure | [UX skill](.agents/skills/ux/SKILL.md), with [Read](.agents/skills/ux/references/read.md), [Edit](.agents/skills/ux/references/edit.md), [Act](.agents/skills/ux/references/act.md), [Feedback](.agents/skills/ux/references/feedback.md), and [Grow](.agents/skills/ux/references/grow.md) |
| Imperative modal wiring                                                                    | [Modal skill](.agents/skills/modal/SKILL.md)                                                                                                                                                                                                                                                |
| Three-layer token structure and component specification method                             | Installed [design-system skill](.agents/skills/design-system/SKILL.md), applied through this contract                                                                                                                                                                                       |

Resolve conflicts in order: direct user instruction; the repository owner for that concern; a recorded scoped exception supported by approval or measured evidence. Record the surface, role, reason, source, and verification for an exception. If sources disagree, expose the conflict and resolve it with the owner; do not silently choose whichever source is convenient. Reference products and skill examples inform a scoped decision, but their palette, dimensions, and implementation snippets are not alternate Orvilo defaults.

## Token architecture

Use **primitive → semantic → component** layers, following the selected skill's [token architecture](.agents/skills/design-system/references/token-architecture.md). This is the required design model; it does not require a new token JSON, generated stylesheet, or parallel theme registry.

| Layer     | Responsibility                                           | Orvilo example                                                                         |
| --------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Primitive | Approved raw color, dimension, duration, or type value   | Existing neutral palette; 8px radius; 14px body size                                   |
| Semantic  | Assign a stable purpose across themes and libraries      | Primary action fill; body text; small-control height; overlay radius                   |
| Component | Map a specific component/variant/state to semantic roles | Primary Button background and foreground; property-picker height; tooltip inverse pair |

Components consume semantic roles directly or through component aliases. Their geometry may use an existing role mapping or variant; a CSS variable for every property is unnecessary. Keep the role consistent across concrete consumers before extracting a shared abstraction. The skill's blue palette, 40/48px controls, always-white foregrounds, HSL values, and Tailwind v3/class-dark snippets illustrate structure only.

Orvilo currently has two implementations: the Lobe/antd theme engine exposes `cssVar.*` through `ThemeProvider` (`orvilo-vars`), while local primitives use Tailwind CSS variables in [globals.css](src/app/globals.css). Both must express this contract. The actual stack is Tailwind v4 with `@theme inline`, complete color values, and the `data-theme` route selected by [NextThemeProvider](src/layout/GlobalProvider/NextThemeProvider.tsx); respect that stack when implementing aliases. Never wrap a complete color value in `hsl()` merely because an upstream example does so. Differences between adapters are migration findings, not permission to introduce independent palettes.

## Colors

Use role names rather than raw values from the reference tables. Text, surfaces, borders, action fills, state washes, and state text are separate roles:

- `colorText` is primary text/icons; `colorTextSecondary` is secondary text/labels. Tertiary is subdued supporting content and quaternary disabled content. A lower hierarchy does not waive readable-text contrast.
- Layout, container, secondary container, and elevated backgrounds describe canvas/panel depth. Use everyday divider and stronger-edge roles for borders; use translucent fills for washes.
- Primary identifies the main action, links, and related emphasis. Success, warning, error, and info communicate state with a label or icon as well as color.
- Filled actions pair their background with the corresponding foreground role. Tinted washes pair with state text, not the filled-action foreground. Text-only links use a legible text role. **Primary foreground is not always white**: the default dark primary fill is near-white and needs dark foreground text.

Hover/active colors are state roles, not a universal “darker” function: the correct direction can differ by theme, library, fill, and wash. Map each variant intentionally and check the resulting pair on its actual background. Do not assume matching token names or fixed reference values prove contrast.

### Local primitive fill roles

Local primitives read these Tailwind roles. [themeRoles.ts](src/styles/themeRoles.ts) resolves them at runtime and [globals.css](src/app/globals.css) holds the matching fallbacks; change both together.

| Tailwind role                        | Engine role             | Light / dark default                        | Use                                                                          |
| ------------------------------------ | ----------------------- | ------------------------------------------- | ---------------------------------------------------------------------------- |
| `--muted`, `--secondary`, `--accent` | `colorFillTertiary`     | `rgba(0,0,0,.03)` / `rgba(255,255,255,.06)` | Soft static fill, track, skeleton, secondary action fill, and the hover wash |
| `--selected`                         | `colorFillSecondary`    | `rgba(0,0,0,.06)` / `rgba(255,255,255,.1)`  | Persistent selected, pressed, or active state; one step above hover          |
| `--ring`                             | `colorText`             | `#080808` / `#ffffff`                       | Focus indicator, used at 50% by primitives                                   |
| `--invert` / `--invert-foreground`   | `colorText` / container | `#080808` on `#ffffff` / reversed           | Inverse badge and alert                                                      |

These fills are translucent washes, not surfaces: they stay visible on the page canvas, panels, and popovers alike. `colorBgContainerSecondary` remains an engine surface role and is no longer what `bg-muted` or `bg-secondary` paint. A sticky cell that must hide scrolling content keeps an opaque base and layers the wash as an image with the `wash-*` utility (`bg-background wash-muted`); never use a wash as the only paint there. Status colors used as text or icons take the `*-text` roles (`text-destructive-text`), not the fill roles. The mapping, consumer audit, and follow-ups are recorded in [semantic token roles](docs/development/semantic-token-roles.md).

The local [Tooltip](src/components/ui/tooltip.tsx) uses the existing inverse **`bg-foreground` / `text-background`** pair, including its arrow. Preserve that tooltip contract. `colorBgSpotlight` remains a retained engine role; neither spotlight nor elevated is an instruction to recolor local tooltips.

## Typography

Geist sets UI and prose; Geist Mono sets code, with tabular figures for aligned numbers. The normal scale is **14px body/labels, 12px metadata, 16px emphasis**. Headings use the existing 38/30/24/20/16px scale and 600 strong weight. Preserve role-appropriate line heights rather than shrinking text to fit a control.

Measured dense Linear/Plane surfaces may use a scoped **13px** label/body role; longer prose may use **15px** where that reading role is explicit. These are not universal defaults or automatically invalid sizes. Current project rail section labels use 13px/500 through [SECTION_LABEL_PROPS](src/features/Projects/sectionLabel.ts); activity links and milestone metadata in [ProjectSidePanel](src/features/Projects/Layout/ProjectSidePanel.tsx) remain 12px. The issue rail also retains [RAIL_VALUE_FONT_SIZE](src/features/AgentTasks/AgentTaskDetail/railText.ts) at 13px and its description at 15px/450, recorded in the [rail type checks](src/features/AgentTasks/AgentTaskDetail/railText.test.ts). Review the role and source before changing these values. Rank text through semantic tone and weight as well as size; there is no categorical 13px ban.

## Density and exceptions

Use the established role, not the library's size name, to choose geometry.

| Role                                       | Approved height / target                     |
| ------------------------------------------ | -------------------------------------------- |
| Normal small / default / large controls    | 28 / 36 / 40px                               |
| Known compact work toolbars and controls   | 32px                                         |
| Dense property controls                    | 28px                                         |
| Sidebar small actions / standard hit areas | 24 / 32px                                    |
| Task row                                   | 44px row role, separate from control heights |

The local Button currently defaults to 32px and has 24/28/36px variants. That implementation is a compact migration default, not a change of the normal 36px design target. Choose the surface's intended role explicitly. A shared default change needs a scoped consumer audit and product acceptance; this documentation does not authorize switching every consumer. Visible icon size and hit area are separate. Preserve accessible hit areas, labels, and keyboard paths, including for dense controls.

Spacing uses a 4px base rhythm: 4/8/12/16/20/24/32px for common gaps and insets. The selected [primitive reference](.agents/skills/design-system/references/primitive-tokens.md) also allows **2/6/10/14px half steps**. Assign those deliberately to a semantic or component role and repeat that role consistently; do not categorically round them away. Default grouping remains about 8px inside groups, 16px between groups, and 24–32px between sections; card padding is normally 16–24px.

Optical corrections require a local explanation and evidence. Keep ProjectSidePanel's **11px card inset**: its source records the border, start chrome, and stable scrollbar-gutter measurement that anchors the rail content. Its 10px hover extension is also local geometry. These facts do not create a general 11px spacing token. Icon sizes and hairline borders are dimensions; radius is an independent scale.

Work surfaces use the existing [WorkSurface](src/features/WorkSurface/WorkSurface.tsx) geometry: fixed 16px gutters, a 960px document cap, and surface-container responsiveness. Collections use available width; document reading lanes center within the cap. Keep each pane's scroll ownership and the toolbar overflow mechanism. Do not apply the chat wide-screen preference to work pages. Adapt supported mobile layouts and overflow deliberately.

Settings content width is owned by [SettingContainer](src/features/Setting/SettingContainer.tsx):
`width="form"` is the default **640px** lane for forms, including Profile, Agents,
Appearance, notifications and workspace General; `width="wide"` is the **1024px**
lane for provider configuration, lists, reports and comparison grids (credentials,
API keys, devices, members, audit log, memory, storage, integrations, imports,
statistics, usage and billing/plans/credits). Both shrink to available width.
The shared [tab policy](src/features/Setting/settingsWidth.ts) also drives route
skeletons. Pages choose a named option, never another numeric content cap or an
inner narrowing wrapper. Dedicated multi-pane settings such as Connector retain
their own layout container and scroll ownership.

## Shapes and elevation

Map shape by purpose and **resolved pixels**, not by assumptions about Tailwind class names:

| Role                | Approved radius | Existing engine name |
| ------------------- | --------------- | -------------------- |
| Chip/tag            | 4px             | `borderRadiusXS`     |
| Small control/input | 6px             | `borderRadiusSM`     |
| Button/card         | 8px             | `borderRadius`       |
| Overlay/menu/dialog | 12px            | `borderRadiusLG`     |

Pills, avatars, and circular actions may be fully round. Role-specific shapes may coexist within one view. The current Tailwind base radius resolves to 10px, with `rounded-lg` at 10px and `rounded-xl` at 14px (at a 16px root size); these differ from the approved 8/12px button-card/overlay roles. Record and resolve that drift in a scoped migration. ProjectSidePanel's former 10px card radius was migrated to the 8px card role; its measured 11px inset remains a separate optical exception.

Depth comes from surfaces and borders first. Shared elevation roles are raised cards (`boxShadowTertiary`, often none), popovers/menus (`boxShadowSecondary`), and dialogs (`boxShadow`). The light reference values above describe the existing engine; values may change between light and dark while those roles remain shared. Avoid imposing one library's shadow formula on another. In the dark theme dialogs take no shadow: the scrim and the 1px ring already define the edge.

Preserve the native desktop glass/translucency boundary in [global styles](src/styles/global.ts) and the desktop shell. Theme-aware translucent surfaces must remain legible over the actual native backdrop; an opaque web reference is not authority to flatten native glass.

## Motion

Motion explains change. Honor both **`prefers-reduced-motion` and the user's disabled-animation setting**. Nonessential motion stops under either; essential status remains understandable through static text or indicators.

Keep state/popover changes around 100–200ms and overlays up to about 300ms. List transition properties explicitly (`color`, `background-color`, `border-color`, `box-shadow`, and when needed `opacity` or `transform`); avoid `transition: all`. The actual theme and motion settings must reach portals and local primitives. Loading behavior belongs to [UX Feedback](.agents/skills/ux/references/feedback.md); loader component selection belongs to [React](.agents/skills/react/SKILL.md).

## Component states and accessibility

Use the components and styling route owned by the [React skill](.agents/skills/react/SKILL.md). The former Lobe base-ui-first mandate is obsolete. This file defines visual requirements, not an alternate import inventory.

| State          | Required visual outcome                                                            |
| -------------- | ---------------------------------------------------------------------------------- |
| Default        | Role-appropriate geometry and readable foreground/background pair                  |
| Hover          | Clear feedback without layout shift                                                |
| Active/pressed | Distinguishable press feedback for that variant                                    |
| Selected       | Persistent selection signal, distinct from transient hover                         |
| Focus          | Visible `:focus-visible` indicator that survives hover/selected/error combinations |
| Disabled       | Recognizably unavailable without hiding necessary context                          |
| Loading        | Stable layout with the applicable project loading treatment                        |
| Error          | Identifiable affected field/action with legible message and non-color signal       |

Apply only states a component supports and document combinations; selected, focused, and error states can coexist. The skill's example priority list must not erase keyboard focus or selection. Busy locking, cancellation, retry, recovery, and draft handling follow UX rather than a universal opacity or pointer-events rule. Native disabled controls are exempt from WCAG contrast requirements; do not mistake that exemption for a readable-text exception elsewhere.

Verify WCAG AA text contrast on the rendered pair: **4.5:1 normal text; 3:1 large text** only at **24px regular or 18.67px bold** (18pt / 14pt). Required interactive graphics, control boundaries, and focus indicators need **3:1** against adjacent colors where the applicable WCAG criterion requires it. Normal 16/18/20px regular text is not “large” for this rule. Fixed theme defaults, tinted backgrounds, and alpha blends require measurement; color names alone prove nothing.

## Migration status

These rules describe the approved target and explicitly retained scoped roles. Current Lobe theme values, Tailwind aliases, local Button sizing, tooltip styling, and project-rail geometry were inspected in source. That inspection identifies migration defaults and drift; it does not prove visual parity, contrast, native glass, or motion behavior in the running product.

The shared App/Auth/Share/Workbench hosts now map resolved engine colors, fonts, elevation, and motion into local primitive roles through `ThemeRoles`. Audited Button/Input/Select/Card/Popover/Dialog/Modal/Badge consumers use the approved shape roles, and the API key creation form explicitly uses 36px controls. The global legacy radius and compact 32px default remain for unaudited consumers; this does not certify every frontend surface. Runtime evidence and scope are recorded in [the frontend verification report](docs/development/design-md-frontend.md). The subsequent Agent, Project, API Key and custom MCP creation changes have [real Electron light/dark verification and before/after evidence](docs/development/design-system-real-ui/evidence/README.md). Future changes must name their consumers, preserve recorded exceptions, and verify the affected path in light/dark and the requested platform.

The existing [Linear token gate](.github/scripts/require-linear-tokens.mjs) is a bounded static screen, not a second visual owner or proof of parity. When it flags an approved scoped value, use its `linear-token-override` line annotation with the DESIGN role and evidence reason (or the documented `linear-tokens: manual-review` PR marker for a reviewed surface); do not change an approved role solely to satisfy its syntax heuristic.

## Voice & Content

Copy is part of the design — precise, calm, and free of filler. The voice is youthful, friendly, and modern on the surface; professional, reliable, and control-first underneath (reference points: Notion, Figma, Apple, Discord, OpenAI).

- Never alternate synonyms (no "bot / assistant / AI agent" drift for Agent). Canonical terms: Workspace, Agent, Agent Profile, Group, Context, Memory, Integration, Skill, Topic, Page, Community, Resource, Library, MCP, Provider, Evaluation, Benchmark, Dataset, Test Case.
- Prefer plain words over jargon; when a technical term is unavoidable, gloss it in plain English.
- Clarity first — short sentences, strong verbs, few adjectives. No hype ("revolutionary", "epic", "100%").
- Layered, not split — one main line that is simple and actionable, plus an optional second line (subtitle, helper text, tooltip) for precision or boundaries. Don't ship "simple vs pro" variants.
- Consistent verbs — reuse the same verb for the same action everywhere: Create / Connect / Run / Pause / Retry / View details / Clear Memory.
- Every message tells the user what to do next. Name actions with a verb and a noun (`Create Agent`, `Delete Session`), never a bare `Confirm`, `OK`, or `Submit`.
- Confirm outcomes by naming the specific thing that changed; skip "successfully" and superlatives.
- In-progress states use a present participle with an ellipsis (`Generating…`, `Saving…`).

### Human warmth

Reduce anxiety and restore control without being sentimental. Default to 80% information, 20% warmth; at key moments (first run, empty state, long waits, failures, data-loss risk, collaboration conflicts) up to 70/30. Hard cap: at most half a sentence to one sentence of warmth, always followed by a clear next step. Order every sensitive message as:

1. Acknowledge the situation, without judgment.
2. Restore control — pause, replay, edit, undo, clear Memory, view Context.
3. Give the next action (button or path).

Avoid preachy encouragement ("don't worry"), grand narratives, and over-anthropomorphizing ("I understand you", "I'll always remember you"). The stance: Agents accelerate output, but the user owns the judgment and the final decision.

### Libraries.dev conversation effects experiment

The user-requested `feat/orbs-chat` experiment directly reuses Libraries.dev's
Thinking Orbs, Border Beam and Bot Avatars rather than approximating their visuals.
Within conversation AI status, composer glow and default assistant avatar only,
upstream particle geometry, animation and effect colors are permitted. Existing
application theme, input layout, custom identity and accessible controls remain
owned by Orvilo. This scoped exception also permits `thinking-orbs` in the two
conversation status components despite the inherited ESLint preference for
LobeHub Spin. It does not authorize replacing unrelated spinners or user avatars.
Evidence and state contract: `docs/research/thinking-orbs/implementation.md`.

### AI Elements conversation presentation

For `feat/orbs-chat`, the user selected AI Elements as the first choice for
matching chat surfaces, with ReUI Code Block for code. Reuse upstream component
structure and spacing within the conversation and composer; map their colors to
existing semantic theme tokens and their triggers to local Base UI primitives.
This supersedes the earlier experiment's requirement to retain the old input
layout. Keep the chosen Orbs, Beam and Bot accents, real domain state, permission
guards, editor behavior and specialized preview engines. The removed composer
operation ticker and four-square Tools shortcut stay removed; Skills use `/`.
Source provenance and behavior coverage: `docs/research/thinking-orbs/ai-elements-migration.md`.
