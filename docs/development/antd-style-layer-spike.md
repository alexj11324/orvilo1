# Spike: put all antd-style output in `@layer antd-style`

Status: spike, draft PR. **Nothing here was verified in a running app** (no dev server, no Electron).
Verified: the unit test of the wrapper against a real antd-style/emotion instance, and a static
scan of the source tree. Based on `fix/antd-global-style-layer` (PR #565, adds `@layer antd`).

## Problem

`createStaticStyles` / `createStyles` from `antd-style` write through an emotion cache and inject
**unlayered** rules. Tailwind v4 utilities live in `@layer utilities`, and an unlayered rule beats any
layered rule whatever the specificity. So an antd-style class on an element always beats Tailwind
utilities on that element, including `hover:` / `focus-visible:` / size utilities of the local
ReUI/shadcn primitives. Motivating case: `styles.field { background: transparent }` in
`src/features/Projects/Workspace/ProjectPlanningFields.tsx` removed the Button's `hover:bg-accent`.

## Verdict

Feasible with caveats. One central change moves 100% of the static output (and `cx`-merged output)
into a named layer, with no codemod and no module alias. The cost is not the mechanism but the
precedence flip: about 160 call sites (static scan, lower bound) rely on antd-style winning and must be
fixed page by page.

## Mechanism

1. `src/styles/layerEmotionCache.ts` wraps `cache.insert` of an emotion cache. Emotion calls
   `insert(selector, serialized, sheet, shouldCache)`. For a non-empty `selector` (a class rule) it
   rewrites the call to `insert('', { ...serialized, styles: '@layer antd-style{<selector>{<styles>}}' })`.
   stylis (v4.2, `@layer` supported) then handles nested `&:hover` and `@media` inside the layer
   block. An empty selector (emotion's `keyframes()` output, other chained global fragments) passes
   through untouched. The unit test shows the compiled output.
2. `src/styles/antdStyleLayer.ts` is a side-effect module that applies it to `styleManager.cache`
   from `antd-style`, the default cache used by the exported `createStaticStyles`, `createStyles`,
   `css`, `cx` **and by every `@lobehub/ui` component** (it resolves to the same antd-style package
   instance). It is the first import of `src/initialize.ts`, which is the first import of every
   renderer entry (`entry.web|desktop|mobile|popup|auth`), so it runs before any
   `createStaticStyles` call in the \~980 files. It logs `console.error` if rules were already inserted.
3. `src/app/globals.css`: `@layer theme, base, antd, components, antd-style, utilities;`.
4. Single switch: `ANTD_STYLE_LAYER_ENABLED` in `antdStyleLayer.ts`.

Why this and not the alternatives:

| Option                                                        | Result                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| stylis plugin (`createStyleProvider({ stylisPlugins })`)      | Only reaches caches created by `<StyleProvider>`. The module-level default cache that `createStaticStyles` uses has no plugin hook. A root-level `rule` also has to be mutated into a layer node (stringify sets `return` itself), which is more fragile than wrapping the input string. |
| `createStaticStylesFactory({ cache })` + local wrapper module | Needs the 967 direct imports redirected (codemod or alias) and still misses `@lobehub/ui`'s internal imports unless aliased globally.                                                                                                                                                    |
| Alias `antd-style` to a wrapper                               | Works but touches Vite, Next/Turbopack, Vitest and apps/\* configs, and risks a second package instance (`lib` CJS vs `es`), which would give two caches.                                                                                                                                |
| Alias `@emotion/css/create-instance`                          | Order-independent and covers every cache, but the alias has to reach pre-bundled deps in each bundler. Keep as the fallback if import order proves fragile.                                                                                                                              |
| Patch `cache.insert` of the default cache (chosen)            | One module, no config, covers lobehub. Weakness: depends on import order (guarded by the `late` check).                                                                                                                                                                                  |

Facts checked in `node_modules` (antd-style 4.1.0, @emotion/css 11.13):

- Runtime `createStyles` is effectively unused: 0 files in `src`, 1 file in `@lobehub/ui` es vs 160 using
  `createStaticStyles`. `<StyleProvider speedy>` in `SPAGlobalProvider`/`ShareAppShell` creates a second
  emotion instance (same key `acss`) that only `createStyles` would use. It is not patched; the 1 lobehub
  `createStyles` file would stay unlayered. If that matters, drop the provider (loses `speedy` in prod) or
  patch via `stylisPlugins`.
- `createGlobalStyle` uses `@emotion/react` `<Global>` and its own default cache (key `css`), not antd-style's.
  Global styles are therefore unaffected (stay unlayered), which matches PR #565's decision for `html/body`.
- `src/app` has no `extractStaticStyle` use. `apps/auth|share|workbench` do (`entry.server.tsx`), with their own
  `StyleProvider cache`. They need the same side-effect import in server and client entries and the layer
  statement in their CSS. Extraction reads `cache.inserted` strings, which will now be layered. Not done here.
- `@keyframes` from emotion's `keyframes()` are emitted bare. A literal `@keyframes` written inside a class
  `css` block ends up inside the layer block, which is valid CSS (name lookup is not layer scoped).

## Blast radius (static, `src/**`, non-test, 4,945 files)

Method: TypeScript AST scan. For every JSX `className` that references a key of a `createStaticStyles`
object (local or imported from a sibling styles file) it compares the CSS property families that the
antd-style key declares (top level and nested states) with the Tailwind utility families on the same
element (string literals in `cx/cn/template`), or, for `@/components/ui|reui` primitives, with the
utilities in that primitive's component body and its `cva` constants.

| Metric                                                                                                                                | Count                                 |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Files defining `createStaticStyles` in `src`                                                                                          | 769 (981 incl. apps, packages, tests) |
| `className` attributes that use an antd-style class                                                                                   | 4,226                                 |
| ...of which also carry Tailwind-looking utilities (same attribute)                                                                    | 1,170 in 459 files                    |
| ......same property family on both (antd-style used to win, Tailwind wins after)                                                      | 138 (+1 state-only)                   |
| .........of which only layout-ish families (display/flex/align/gap/position/overflow/cursor), mostly identical duplicate declarations | 89                                    |
| .........of which touching color/background/border/radius/padding/size/font/shadow                                                    | 49 in 34 files                        |
| antd-style class passed to a `@/components/ui\|reui` primitive                                                                        | 164 elements in 109 files             |
| ...primitive has a base utility for a property the class sets (class loses)                                                           | 118 (107 non-layout, 81 files)        |
| ...only a state variant overlaps (`hover:` / `focus:` now takes effect: the bug direction)                                            | 8                                     |
| ...no overlap                                                                                                                         | 38                                    |
| Files with any overlap / with a non-layout overlap                                                                                    | 160 / 100                             |
| Tailwind `className` passed to `@lobehub/ui` components (reverse direction)                                                           | 81 elements, 0 with utilities         |
| Tailwind `className` passed to local lobehub adapters (ActionIcon, Menu, ...)                                                         | 64 elements, 3 with utilities         |

Primitive hits by component: Button 44 (43 lose), Badge 19, DropdownMenu 12, Tabs 11, Stepper 10,
Accordion 10, Input 10, ScrollArea 6, Select 5, Breadcrumb 5, Textarea 5, Popover 5.

Limits of the numbers (all push the real count **up**, except the first):

- The primitive match uses the union of the component's `cva` variants and sizes, so a `variant="ghost"` call
  site may be flagged for a `bg-primary` it never gets. Upper bound for that bucket.
- Not seen: class names forwarded through props (`className={className}`), `classNames={{...}}`,
  `cx` results stored in variables, antd-style used inside adapters. A runtime computed-style diff is needed.
- Same-family overlap does not prove a visual change when the values are equal (for example `display:flex` twice).

### Categorised sample (file:line, property that flips)

Primitive default now wins over the antd-style override (the antd-style value is lost):

| #   | Site                                                                                                         | Flips                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| 1   | `src/features/ChatInput/ControlBar/WorkingDirectoryPicker.tsx:568` Button `styles.clearText`                 | height, padding, font-size, color, transition                           |
| 2   | `src/features/ChatInput/ControlBar/ModeSelector.tsx:222` Button `styles.option/activeOption`                 | width, height, padding, radius, background                              |
| 3   | `src/features/ChatInput/components/SelectorTrigger.tsx:100` Button `styles.trigger`                          | height, padding, border, radius, font-size, color, background           |
| 4   | `src/features/Conversation/Messages/AssistantGroup/Tool/Detail/Intervention/ApprovalActions.tsx:382` Button  | height, radius                                                          |
| 5   | `src/features/Billboard/Carousel.tsx:237` Button `styles.action` (+ `w-full`)                                | display, width                                                          |
| 6   | `src/features/Conversation/MessageForward/SelectToHereButton.tsx:73` Button `styles.button`                  | background                                                              |
| 7   | `src/components/ModelSelect/index.tsx:209` Badge `styles.token`                                              | width, height, radius, font-size, color, background                     |
| 8   | `src/components/ChangelogModal/VersionTag.tsx:23` Badge `styles.tag`                                         | padding, radius, color                                                  |
| 9   | `src/features/ChatInput/InputEditor/LocalFileTag/LocalFileTag.tsx:213` Badge `styles.tag`                    | height, padding, radius, font-size, line-height, color, background      |
| 10  | `src/features/AgentTasks/features/IssueStatusPicker.tsx:273` Input `styles.searchInput`                      | width, height, padding, border, radius, font-size, background           |
| 11  | `src/features/AgentSettings/HeterogeneousAgentStatusCard.tsx:649` Input `styles.commandInput`                | width, height, radius, font-size, padding                               |
| 12  | `src/features/AgentTasks/AgentTaskDetail/TaskDetailTitleInput.tsx:46` Textarea `styles.titleInput`           | min-height, padding, border, radius, font-size, background              |
| 13  | `src/features/ChatInput/ControlBar/BranchSwitcher.tsx:564` DropdownMenuItem `styles.item`                    | gap, padding, radius, font-size (focus color/background are state-only) |
| 14  | `src/features/AgentTasks/AgentTaskDetail/TaskScheduleConfig.tsx:395` PopoverContent `styles.popover`         | radius, background                                                      |
| 15  | `src/features/ChatInput/ControlBar/StaleGitSnapshot.tsx:132` DropdownMenuContent `styles.popup`              | padding                                                                 |
| 16  | `src/features/AgentSidebar/Topic/index.tsx:46` AccordionTrigger `accordionStyles.trigger`                    | align-items, justify-content, flex                                      |
| 17  | `src/features/ChatTerminal/Content.tsx:160,163` TabsList / TabsTrigger                                       | gap, padding, radius, background; height, font-weight, color            |
| 18  | `src/features/Acceptance/Viewer/Checks/AcceptanceCheckInventory.tsx:256` SelectTrigger `styles.filterSelect` | width (`w-fit`)                                                         |
| 19  | `src/features/ChatInput/Desktop/ContextContainer/ContextList.tsx:41` ScrollArea `styles.container`           | width                                                                   |

Plain element with both an antd-style class and Tailwind utilities (utility wins after):

| #   | Site                                                                                                                                   | Flips                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 20  | `src/components/Menu/index.tsx:119` `styles.item/selected` + `min-h-8 py-1`                                                            | min-height, padding                                                    |
| 21  | `src/features/AgentGoals/GoalCardItem.tsx:50` `styles.card` + `border border-border`                                                   | border                                                                 |
| 22  | `src/features/AgentGoals/NorthStarMetrics/index.tsx:120` `styles.stale` + `text-muted-foreground`                                      | color                                                                  |
| 23  | `src/features/EditorCanvas/DiffAllToolbar.tsx:129` toolbar styles + `shadow-md`                                                        | box-shadow                                                             |
| 24  | `src/features/Projects/List/index.tsx:524` `styles.cell` + `text-sm`                                                                   | font-size                                                              |
| 25  | `src/features/Settings/common/features/Appearance/Preview.tsx:218` `styles.container` + `rounded-md border`                            | border, radius                                                         |
| 26  | `src/features/ResourceManager/components/LibraryHierarchy/HierarchyNode.tsx:306` `treeItem/fileItemDragOver/dragging` + `bg-secondary` | background (drag/hover states can lose to the base utility)            |
| 27  | `src/features/Conversation/TodoProgress/index.tsx:242` `textTodo/textCompleted` + `text-muted-foreground`                              | color (completed vs todo distinction)                                  |
| 28  | `src/features/Work/WorkSummaryCard.tsx:220` `styles.inlineTitle` + `truncate min-w-0`                                                  | min-width                                                              |
| 29  | `src/features/Projects/Workspace/ProjectOverviewField.tsx:74` Input `styles.input` + `rounded-none border-0 px-0 shadow-none`          | padding, border, radius, shadow (Tailwind side is the intended winner) |

State-only overlap (the fix direction: the primitive's `hover:` / `focus:` utility starts working):

| #   | Site                                                                                              | Unblocked                              |
| --- | ------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 30  | `src/features/ChatInput/ControlBar/ApprovalMode.tsx:214` DropdownMenuItem `selectedItem`          | `focus:bg-accent`                      |
| 31  | `src/features/NavPanel/components/SidebarNavItem.tsx:105` SidebarMenuButton `hostStyles.row`      | `hover:text-sidebar-accent-foreground` |
| 32  | `src/features/ReUIShell/SidebarShell.tsx:129` SidebarProvider `hostStyles.sidebar`                | `has-data-[variant=inset]:bg-sidebar`  |
| 33  | `src/routes/(main)/agent/features/Conversation/MainChatInput/AgentConfigError.tsx:58` AlertAction | `sm:self-center`                       |

Direction of the other layers, unchanged: Tailwind preflight is in `@layer base`, so it stays below antd-style
either way.

## Other precedence changes (not counted above)

- Unlayered rules now beat antd-style classes: `src/styles/global.ts` and `antdOverride.ts`
  (`.ant-popover` z-index, `.ant-modal-mask` background with `!important`, `button { -webkit-app-region }`,
  context-menu trigger highlight), the lobehub `html/body/code` copy in `baseReset.ts`, 6 `createGlobalStyle`
  call sites, and the unlayered rules in `globals.css` (`.orvilo-entry-surface ...`, `.text-shiny`).
  All target specific selectors; expect few visible changes.
- `!important`: 220 lines in `src` contain it. In layers the order of `!important` is reversed (earlier layer
  wins) and a layered `!important` beats an unlayered one, so an antd-style `!important` now beats Tailwind
  `!` utilities and unlayered `!important` globals. Audit before relying on either.
- Layer order is by first declaration. If the patch is on but `antd-style` is missing from the
  `@layer` statement, the layer is created at runtime after `utilities` and wins over Tailwind (the old
  behaviour). If the statement is there but the patch is off, nothing changes. Both failure modes are safe.
- Import-order dependence: a rule created before the patch stays unlayered silently except for the
  `console.error`. On SSR-hydrated caches (`apps/*`), pre-existing `inserted` entries would trigger a false
  "late" report.

## Proposed rollout

1. Land PR #565 first (cssinjs `@layer antd`, lobehub reset in `@layer base`).
2. Land this behind `ANTD_STYLE_LAYER_ENABLED = false` (declaring the layer is harmless).
3. In an Electron run with the flag on, capture before/after computed styles for the 33 listed sites
   plus a sweep of the 160 files (the scan script can emit the list). Fix flips page by page by moving the
   override to the element as Tailwind classes through `cn()` so tailwind-merge resolves the conflict, or by
   deleting the antd-style rule when the primitive default is the intended design.
4. Flip the flag; keep the fixes small and reviewable per feature area.
5. Follow-ups: `apps/auth|share|workbench` (server and client entries, own CSS), the `<StyleProvider>`
   cache if `createStyles` is ever used again, and a lint rule that forbids antd-style classes on
   `@/components/ui|reui` primitives.

- Alternative if a big-bang flip is too risky: make it opt-in per feature by wrapping only selected
  modules' output (a second `createStaticStylesFactory({ cache })` whose cache is layered). This costs a
  codemod per feature and leaves the default behaviour as is.

## Not verified

No dev server, Electron or browser run. Unverified in particular: that `@lobehub/ui` is deduped to the
same antd-style instance in Vite's dev pre-bundle and in the production build (installed tree shows a
single symlinked instance); that no entry evaluates an antd-style module before `src/initialize.ts`;
visual parity of any flipped site; the apps/\* SSR path.
