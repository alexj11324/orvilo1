---
version: alpha
name: Orvilo
description: Orvilo's visual contract. Colour values below are the default light output of the local theme generator (src/styles/theme/generate.ts); DESIGN.dark.md lists the dark output. Runtime adapters must implement the same semantic roles.
themeable:
  # Users pick a primary (accent) and a neutral (base); each stored name maps to
  # one OKLCH seed in src/styles/theme/seeds.ts. Components must read the
  # semantic roles below rather than hard-coding any value from this list.
  primaryColor:
    default: ~ # monochrome when unset: near-black in light, near-white in dark
    options:
      [red, orange, gold, yellow, lime, green, cyan, blue, geekblue, purple, magenta, volcano]
  neutralColor:
    default: ~ # the built-in cool `gray` base, calibrated to Linear, when unset
    options: [mauve, olive, sage, sand, slate]
  contrast: 30 # internal generator input only; not a user setting
colors:
  # Generated semantic roles (CSS variable names), default light input.
  primary: '#212223' # monochrome by default; the chosen accent seed otherwise
  primary-foreground: '#ffffff'
  success: '#27a644'
  warning: '#f2c94c'
  destructive: '#eb5757'
  info: '#4ea7fc'
  # Text — solved for contrast targets on the panel; rank info with these
  foreground: '#171718' # primary text and icons (17.9:1)
  muted-foreground: '#2e3138' # secondary text, labels (13:1)
  foreground-tertiary: '#60646c' # captions, descriptions, placeholders, icons (5.9:1)
  foreground-quaternary: '#898d95' # disabled (3.3:1)
  # Surfaces — separate ladder from text; never substitute one for the other
  background: '#f6f7f9' # page canvas and sidebar
  card: '#ffffff' # primary panel surface
  surface-secondary: '#fafbfd' # opaque secondary container surface
  popover: '#ffffff' # popovers, menus, modals
  # Borders: hairlines are decorative; the control edge reaches 3:1
  border: '#e0e2e6' # stronger hairline
  divider: '#e8ebef' # everyday divider
  input: '#8a8d94' # control boundary
  # Fills are translucent washes of the neutral ink
  fill: 'rgba(16, 18, 21, 0.1)'
  selected: 'rgba(16, 18, 21, 0.06)'
  muted: 'rgba(16, 18, 21, 0.035)' # hover wash
  fill-quaternary: 'rgba(16, 18, 21, 0.018)'
elevation:
  # Shared elevation roles; light values, dark values differ (generator output)
  shadow-raised: '0 3px 1px -1px rgba(26, 26, 26, 0.06)' # raised cards
  shadow-popover: '0 8px 16px -4px rgba(0, 0, 0, 0.2)' # popovers, menus
  shadow-dialog: '0 20px 20px -8px rgba(0, 0, 0, 0.24)' # modals, dialogs
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

This file is the single Orvilo visual contract for both appearances. [DESIGN.dark.md](DESIGN.dark.md) supplies dark color defaults only. The YAML above lists the generator's default light output; the generator, not this list, is the source of the values, and its tests prove the contrast floors below.

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

Every colour comes from one local generator, [generate.ts](src/styles/theme/generate.ts), seeded by [seeds.ts](src/styles/theme/seeds.ts). [ThemeRoles](src/styles/themeRoles.ts) publishes its output as Tailwind CSS variables on the document theme host, and [globals.css](src/app/globals.css) holds the same default output for paint before that host mounts (a test keeps them equal). Until the engine is removed (P5 of the [retirement plan](docs/development/antd-retirement-plan.md)), the remaining Lobe/antd components receive the same generated values as `theme.token`; they no longer supply any role. The actual stack is Tailwind v4 with `@theme inline`, complete color values, and the `data-theme` route selected by [NextThemeProvider](src/layout/GlobalProvider/NextThemeProvider.tsx); respect that stack when implementing aliases. Never wrap a complete color value in `hsl()` merely because an upstream example does so. Do not introduce an independent palette beside the generator.

## Colors

Use role names rather than raw values from the reference tables. Text, surfaces, borders, action fills, state washes, and state text are separate roles:

- `foreground` is primary text/icons; `muted-foreground` is secondary text/labels. Tertiary is subdued supporting content (descriptions, placeholders, icons) and quaternary disabled content. A lower hierarchy does not waive readable-text contrast.
- Background, card, secondary surface, and popover describe canvas/panel depth. Use the everyday divider and stronger border roles for hairlines, the `input` role for control boundaries, and translucent fills for washes.
- Primary identifies the main action and related emphasis. Success, warning, error (`destructive`), and info communicate state with a label or icon as well as color.
- Filled actions pair their background with the corresponding foreground role. Tinted washes pair with state text, not the filled-action foreground. Text-only links use the `--link` role; visited hyperlink text uses `--link-active` (`visited:text-link-active`). **Primary foreground is not always white**: the default dark primary fill is near-white, and bright accents (yellow, lime, cyan, blue) take the dark foreground.

Hover/active colors are state roles, not a universal “darker” function: the generator moves a fill towards the panel for hover and away from it for press, then re-picks its foreground. Check each variant on its actual background; matching names or reference values do not prove contrast.

### Generation

[generate.ts](src/styles/theme/generate.ts) is a pure function of four inputs, following the method Linear published for its 2024 theme system (base, accent and contrast in a perceptual space), implemented in OKLCH:

| Input      | Source                                                            | Drives                                             |
| ---------- | ----------------------------------------------------------------- | -------------------------------------------------- |
| `mode`     | `next-themes`                                                     | Direction of every adjustment                      |
| `base`     | Stored neutral name (`gray` default, mauve/olive/sage/sand/slate) | Surfaces, borders, text, washes                    |
| `accent`   | Stored primary name; unset keeps the monochrome primary           | Primary fill, washes, borders, primary text, links |
| `contrast` | Fixed internal default `30`; not a user setting                   | Surface steps and text targets                     |

Rules:

- **Surfaces** use the base hue at a quarter of its chroma on a fixed lightness ladder: dark canvas/panel/menu at OKLCH L 0.139 / 0.172 / 0.213; light canvas 0.975 below a white panel and menu. Steps scale with contrast.
- **Text** roles are solved, not picked: each finds the lightness that reaches a target ratio on the panel — foreground 17.9, secondary 13, tertiary 5.9, quaternary 3.3 — then is pushed further if needed so foreground, secondary and tertiary keep 4.5:1 on every surface and on the selected wash over it. Quaternary is disabled content and exempt.
- **Borders**: `border` and `divider` are decorative hairlines; `input` is pushed until it reaches 3:1 on every surface. **Focus** uses `ring` = foreground, so the primitives' `ring-ring/50` stays above 3:1; an accent ring could not promise that for every stored accent.
- **Fills** are the neutral ink at fixed alpha (light 0.10 / 0.06 / 0.035 / 0.018, dark 0.14 / 0.09 / 0.055 / 0.025 for fill / selected / hover / quaternary).
- **Colored families** (primary and the fixed-hue status seeds success, warning, info, error) share one rule: the fill is the seed, nudged only if neither white nor the near-black ink reaches 4.5:1 on it; subtle/wash/wash-hover/border/border-hover mix 10/14/22/35/50% of the fill into the panel in OKLab (half for the monochrome primary); `*-text` is the hue pushed to 4.5:1 on the panel, page, menu and its own washes.
- **Primary** stays monochrome by default (near-black in light, near-white in dark). A stored accent replaces it with that seed; links then use the accent text role.
- **Palette** ramps (`--palette-{hue}-{1..10}`) are raw identity primitives with the seed at step 6, lightest at step 1 in light and at step 10 in dark. Memory category chips use a faint tint of their hue with AA text.

Calibration: the dark surfaces and text ladder are the measured Linear product values from the archived [Linear reference](.agents/skills/linear-design/linear-app-DESIGN.md) (#08090a, #0f1011, #18191a, #23252a; #f7f8f8, #d0d6e0, #8a8f98, #62666d); the default `gray` base takes their faint cool tint (hue ≈ 262). A live authenticated Linear session was not available when the generator was written, so light mode mirrors the measured dark contrast ratios on a white panel rather than copying measured light values; status seeds use Linear's status colours (success #27a644 measured; error #eb5757, warning #f2c94c, info #4ea7fc). Re-measure both appearances through the [Linear parity](.agents/skills/linear-ui-parity/SKILL.md) CDP flow before treating light mode as matched. Accent and named neutral seeds are the exact OKLCH form of their existing settings swatches, so stored names and saved swatch colours keep working.

[generate.test.ts](src/styles/theme/generate.test.ts) checks every accent × base × mode combination: body, secondary and tertiary text reach 4.5:1 on every surface and wash, filled-action foregrounds and status text reach 4.5:1, and control edges and the focus ring (solid and at 50%) reach 3:1.

### Local primitive fill roles

Local primitives read these Tailwind roles from the generator.

| Tailwind role                        | Generator rule              | Light / dark default                             | Use                                                                          |
| ------------------------------------ | --------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------- |
| `--muted`, `--secondary`, `--accent` | Neutral ink, hover alpha    | `rgba(16,18,21,.035)` / `rgba(246,249,254,.055)` | Soft static fill, track, skeleton, secondary action fill, and the hover wash |
| `--selected`                         | Neutral ink, selected alpha | `rgba(16,18,21,.06)` / `rgba(246,249,254,.09)`   | Persistent selected, pressed, or active state; one step above hover          |
| `--ring`                             | Foreground                  | `#171718` / `#f7f8f8`                            | Focus indicator, used at 50% by primitives                                   |
| `--invert` / `--invert-foreground`   | Foreground / card           | `#171718` on `#ffffff` / reversed                | Inverse badge and alert                                                      |

Further generated roles:

| Tailwind role                                         | Rule                                                       | Use                                                                             |
| ----------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `--foreground-tertiary` / `--foreground-quaternary`   | Text targets 5.9 / 3.3                                     | Subdued supporting / disabled content                                           |
| `--foreground-description`, `-placeholder`, `-icon`   | Tertiary                                                   | Description text, placeholders and icons                                        |
| `--link` / `--link-hover` / `--link-active`           | Accent text, stepping away from the panel; else foreground | Hyperlink text, independent of the primary fill                                 |
| `--fill`, `--fill-quaternary`, `--split-divider`      | Neutral ink alphas                                         | Strong / faintest wash; internal parameter-section separators                   |
| `--divider`                                           | Hairline ladder                                            | Everyday divider outside the sidebar                                            |
| `--overlay-mask` / `--overlay-mask-foreground`        | Black at 45% (light) / 60% (dark); white                   | Scrims and icon overlays on photographs                                         |
| `--{primary,success,warning,info,destructive}-wash`   | 14% mix into the panel (`-wash-hover` 22%)                 | Status background                                                               |
| `--{primary,success,warning,info,destructive}-border` | 35% mix (`-border-hover` 50%)                              | Status edge; `border-primary-border-hover` marks an eligible Kanban drop target |
| `--highlight-gold` / `--highlight-primary`            | `palette-gold-4` / primary wash-hover                      | Shared tool text underline washes                                               |
| `--info-hover-wash`                                   | Info wash-hover                                            | Inactive Goal round-duration graphic                                            |

The `*-wash` roles and the 10% `*-subtle` roles are distinct; do not substitute one for the other by appearance. The mask pair is for a translucent scrim or an icon laid over image content; filled actions still use the foreground paired with their actual fill.

The opaque secondary settings/container surface uses `bg-surface-secondary` / `--surface-secondary`. It is distinct from the translucent `bg-secondary` wash; use the container role when a surface must retain its own background.

These fills are translucent washes, not surfaces: they stay visible on the page canvas, panels, and popovers alike. A sticky cell that must hide scrolling content keeps an opaque base and layers the wash as an image with the `wash-*` utility (`bg-background wash-muted`); never use a wash as the only paint there. Status colors used as text or icons take the `*-text` roles (`text-destructive-text`), not the fill roles. The mapping, consumer audit, and follow-ups are recorded in [semantic token roles](docs/development/semantic-token-roles.md).

The local [Tooltip](src/components/ui/tooltip.tsx) uses the existing inverse **`bg-foreground` / `text-background`** pair, including its arrow. Preserve that tooltip contract.

### Editor compatibility

`@lobehub/editor` still reads antd-style engine variables. The generator exports `EDITOR_TOKEN_ROLES` (the 39 tokens the installed editor reads, re-extracted from `node_modules` and locked by a test) and `editorScopeCss()`, which aliases them to local roles on `.orvilo-editor-scope` only; `generateEngineToken()` supplies the same values for a local editor-only provider. No global engine variable is part of this contract.

## Typography

Geist sets UI and prose; Geist Mono sets code, with tabular figures for aligned numbers. The normal scale is **14px body/labels, 12px metadata, 16px emphasis**. Headings use the existing 38/30/24/20/16px scale and 600 strong weight. Preserve role-appropriate line heights rather than shrinking text to fit a control.

Local Tailwind font sizes remain rem-based, and the metadata/body default line-height ratios scale with them when the root font size changes. Explicit numeric line boxes use rem-based `--leading-*` aliases in [globals.css](src/app/globals.css), separate from the fixed physical `--spacing: 4px` geometry rhythm below. An explicit line-height override still needs the correct role and current layout justification.

Measured dense Linear/Plane surfaces may use a scoped **13px** label/body role; longer prose may use **15px** where that reading role is explicit. These are not universal defaults or automatically invalid sizes. Current project rail section labels use the 13px/500 dense role (`text-(length:--text-dense) font-medium text-muted-foreground`); activity links and milestone metadata in [ProjectSidePanel](src/features/Projects/Layout/ProjectSidePanel.tsx) remain 12px. The issue rail also retains [RAIL_VALUE_FONT_SIZE](src/features/AgentTasks/AgentTaskDetail/railText.ts) at 13px and its description at 15px/450, recorded in the [rail type checks](src/features/AgentTasks/AgentTaskDetail/railText.test.ts). Review the role and source before changing these values. Rank text through semantic tone and weight as well as size; there is no categorical 13px ban. Tailwind code writes the dense role as `text-(length:--text-dense)`, backed by `--text-dense` in [globals.css](src/app/globals.css); the [React role lookup](.agents/skills/react/SKILL.md#role-lookup) owns the class form for every role in this file.

Spreadsheet preview cells display document content. Unformatted cells use the 14px/22px body role on white paper with black fallback ink and neutral grid edges in both themes; the coordinate headers keep the ordinary themed metadata roles. Workbook-authored fills, ink, font family, font size and explicit row/column dimensions take precedence. In [SheetGrid](src/features/Portal/LocalFile/xlsx/SheetGrid.tsx), an authored font uses a proportional 1.35 line box: a 30pt font resolves to 40px and needs a 54px line box rather than the default UI body line box, which can clip automatic or multiline document rows. This applies only when the workbook supplies a font size; it does not change UI typography or unit conversion. Current source review identified and corrected that clipping risk; real Electron default/large-font, multiline and frozen-row acceptance remains required for the delivery.

## Density and exceptions

Use the established role, not the library's size name, to choose geometry.

| Role                                       | Approved height / target                     |
| ------------------------------------------ | -------------------------------------------- |
| Normal small / default / large controls    | 28 / 36 / 40px                               |
| Known compact work toolbars and controls   | 32px                                         |
| Dense property controls                    | 28px                                         |
| Sidebar small actions / standard hit areas | 24 / 32px                                    |
| Task row                                   | 44px row role, separate from control heights |

Ordinary local controls default to 36px. Name known compact work controls explicitly at 32px and dense property controls at 28px; large controls use 40px. Button, NumberField, Toggle/ToggleGroup and AutocompleteInput retain `lg` as their existing 36px API spelling, while `large` selects 40px; this compatibility spelling does not create a visual exception. AutocompleteInput also accepts `md` for the ordinary 36px role. Toggle/ToggleGroup and AutocompleteInput name the 32px work-control role `compact`; classify the current toolbar or form purpose before selecting it. Input uses `visualSize` so native numeric `size` retains its character-width meaning. Shared default changes require scoped consumer review and product acceptance, including forwarded props and inherited styles. Any exception to these roles requires current evidence of necessity and an independent review; a legacy value or prior exception record alone is insufficient. Visible icon size and hit area are separate. Preserve accessible hit areas, labels, and keyboard paths, including for dense controls.

Spacing uses a 4px base rhythm: 4/8/12/16/20/24/32px for common gaps and insets. The selected [primitive reference](.agents/skills/design-system/references/primitive-tokens.md) also allows **2/6/10/14px half steps**. Assign those deliberately to a semantic or component role and repeat that role consistently; do not categorically round them away. Default grouping remains about 8px inside groups, 16px between groups, and 24–32px between sections; card padding is normally 16–24px.

Optical corrections require a local explanation and evidence. Keep ProjectSidePanel's **11px card inset**: its source records the border, start chrome, and stable scrollbar-gutter measurement that anchors the rail content. Its 10px hover extension is also local geometry. These facts do not create a general 11px spacing token. Icon sizes and hairline borders are dimensions; radius is an independent scale.

Work surfaces use the existing [WorkSurface](src/features/WorkSurface/WorkSurface.tsx) geometry: fixed 16px gutters, a 960px document cap, and surface-container responsiveness. Collections use available width; document reading lanes center within the cap. Keep each pane's scroll ownership and the toolbar overflow mechanism. Do not apply the chat wide-screen preference to work pages. Adapt supported mobile layouts and overflow deliberately.

Settings content uses the shared [SettingContainer](src/features/Setting/SettingContainer.tsx)
width owner: configuration forms use `width="form"` (640px), and wide lists or
provider management use an explicit `width="wide"` (1024px). Both caps shrink to
the available content width on narrow screens. The named roles and tab assignments
live in [settingWidth](src/features/Setting/settingWidth.ts); new configuration
pages default to `form`. Personal and workspace settings share this implementation
while retaining their own surface backgrounds, padding, headers, and scroll
owners. Pages that opt out of the settings shell must supply the shared container
or consume its named cap in their own layout, including supported mobile layouts.
These settings roles do not change WorkSurface's document geometry above.

## Shapes and elevation

Map shape by purpose and **resolved pixels**, not by assumptions about Tailwind class names:

| Role                | Approved radius | Variable           |
| ------------------- | --------------- | ------------------ |
| Chip/tag            | 4px             | `--radius-chip`    |
| Small control/input | 6px             | `--radius-input`   |
| Button/card         | 8px             | `--radius-card`    |
| Overlay/menu/dialog | 12px            | `--radius-overlay` |

Pills, avatars, and circular actions may be fully round. Role-specific shapes may coexist within one view. AppTheme's native scrollbar thumb uses this pill role. Its resting neutral fill is `--scrollbar-fill` (the generated `fill` wash), while the prefixed hover thumb uses `--foreground`; the track stays transparent. The current Tailwind base radius resolves to 10px, with `rounded-lg` at 10px and `rounded-xl` at 14px (at a 16px root size); these differ from the approved 8/12px button-card/overlay roles. Record and resolve that drift in a scoped migration. Until then, name the role through its variable (`rounded-(--radius-card)`, `--radius-chip`, `--radius-input`, `--radius-button`, `--radius-overlay`) rather than a Tailwind size name or a pixel literal. ProjectSidePanel's former 10px card radius was migrated to the 8px card role; its measured 11px inset remains a separate optical exception.

The local [Avatar](src/components/Avatar/index.tsx) uses `shape="square"` for entity tiles, including current 14px project breadcrumbs and 16px tool/project identities. Its local `--avatar-square-radius` consumes the 8px card role as a ceiling and caps each corner axis at 25% of its edge: `min(var(--radius-card), 25%)`. This keeps at least half of each edge straight (`edge - 2 × radius ≥ edge / 2`), so the square identity survives below 32px; default squares of 32px and larger retain 8px. This is a scoped shape constraint, not a shared radius scale. Circle avatars remain fully round, caller radius classes and styles keep precedence, and child images inherit the actual root radius. Current source purpose and the mathematical boundary establish the reason for this cap; delivery still requires real Electron small-corner paint, both themes/root sizes, the large-size ceiling and public overrides, plus a fresh independent review of this repair. Historical pixels or exception records alone do not establish necessity.

The split-divider role (`border-split-divider` / `bg-split-divider`) is a translucent neutral separator for internal parameter sections. It is distinct from the everyday opaque `--divider`; the two are not interchangeable.

Depth comes from surfaces and borders first. Shared elevation roles are raised cards (`--shadow-raised`), popovers/menus (`--shadow-popover`), and dialogs (`--shadow-dialog`). The light values above are the generator's; dark shadows are heavier (popover 50%, raised 20% black) while those roles remain shared. Avoid imposing one library's shadow formula on another. In the dark theme dialogs take no shadow: the scrim and the 1px ring already define the edge.

The local raised-surface role is `--shadow-raised`, used as `shadow-(--shadow-raised)`. It applies to document pages and other surfaces that already have that raised treatment; it does not add shadows to ordinary cards. The PDF viewer's clipped document page uses the 8px card radius and retains react-pdf's original paper/canvas paint. Its document canvas frame uses 16px block gutters while keeping the caller's 24px inline gutter; PDF page sizing and annotation coordinates remain owned by the renderer.

NumberField's scrub cursor is 26×14px pointer artwork with black fill and a white contour. Pointer lock lets it move across the field, surrounding surfaces and mixed document backgrounds; one theme text color cannot keep both sides of that contour distinct everywhere. Its local `--number-field-cursor-shadow` token in [number-field.module.css](src/components/reui/number-field.module.css) retains the exact `0 1px 1px #0008` contour shadow, including black alpha 8/15. This scoped pointer treatment does not define surface elevation or an ordinary action-icon size. Current source inspection establishes that purpose; acceptance still requires a fresh independent review and real Electron scrub, light/dark and mixed-background evidence rather than a prior exception record.

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

These rules describe the approved target and explicitly retained scoped roles. Colour roles now come from the local generator (P2 of the [retirement plan](docs/development/antd-retirement-plan.md)), whose unit tests prove the contrast floors for every generated pair; they do not prove visual parity with Linear, native glass, or motion behavior in the running product. Light/dark before/after screenshots and a side-by-side Linear comparison remain required on the delivery PR.

Earlier frontend verification covered the shared App/Auth/Share/Workbench `ThemeRoles` mapping, selected shape-role consumers, and the API key creation form. Its runtime scope is recorded in [the frontend verification report](docs/development/design-md-frontend.md). The subsequent Agent, Project, API Key and custom MCP creation work has [Electron light/dark before/after evidence](docs/development/design-system-real-ui/evidence/README.md). These historical reports do not certify the current ordinary-default 36px migration, every frontend surface, or continued exceptions. Changes must name their consumers and verify affected paths in light/dark and the requested platform. Any proposed exception must have current evidence of necessity and a fresh independent review; prior acceptance alone is insufficient.

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

One departure from upstream sizing: assistant message content takes the full
message width. Upstream sizes `MessageContent` to its content (`w-fit`), which
suits a user bubble but collapses the assistant's steps, tool calls and code to
the width of their longest label, leaving half the column empty. User bubbles
keep `w-fit`.
