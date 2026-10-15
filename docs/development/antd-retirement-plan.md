# antd 与 @lobehub/ui 退役计划（修订版）

基线：`origin/canary` (2026/10/15)。实测：业务代码 628 处 `var(--ant-*)`，分布在 235 个文件；270 个文件 import `@lobehub/ui`；ThemeRoles 从引擎读 72 个 token。

## 结束时同时成立

- 业务代码（`src`、`packages`、`apps`）不 import `antd`、`antd-style`、`@ant-design/cssinjs`、`@lobehub/ui`，由 lint 报错封口。
- 文档里没有 antd reset、`@layer antd` 的 cssinjs、lobehub `ThemeProvider` / `ConfigProvider` 的全局样式。
- 所有颜色由本地生成器算出：输入是明暗、底色（中性色）、强调色（主色）、对比度。不再从任何引擎读取 token。
- `--ant-*` 只出现在编辑器根节点上，作为给 `@lobehub/editor` 的兼容别名，值来自本地语义角色。
- `@lobehub/editor`、`@lobehub/icons` 及它们运行时依赖的 `@lobehub/ui`、`antd`、`antd-style` 仍装在 `package.json` 里（peer 依赖，运行时确有 import），但业务代码不可直接引用。这是 P6 结束时的过渡状态；P7 换掉编辑器后，这几个依赖全部删除。

## 两个核心决定

### 决定一：把 “颜色从哪来” 和 “颜色是什么” 拆成两步

旧计划把两件事绑在一起：先把引擎输出快照成 JSON，再删引擎。快照里存的是 LobeHub 的配色，以后要对齐 Linear 还得再推翻一次，而且快照没有生成规则，新增角色只能再去引擎里取。

新顺序：

1. 先把调用点全部改成语义角色，值仍由引擎提供。纯改名，外观零变化，最容易验收。
2. 再把语义角色的来源换成本地生成器。此时只改一个文件和 DESIGN.md，外观变化集中在一个 PR 里，可以一眼看清。

### 决定二：用 Linear 的方法生成颜色，不抄 Linear 的值表

Linear 2024 年改版后，所有主题由三个输入生成：base color、accent color、contrast，在 LCH 色彩空间里推导出约 98 个语义色（见 Linear 官方博客 “How we redesigned the Linear UI (part Ⅱ)”）。

我们照这个方法做，用 OKLCH（CSS 原生支持，Electron 的 Chromium 可直接用）：

| 输入     | 来源                                                | 作用                           |
| -------- | --------------------------------------------------- | ------------------------------ |
| mode     | `next-themes`                                       | 明 / 暗，决定所有调整的方向    |
| base     | 用户中性色（gray、mauve、slate、sage、olive、sand） | 背景、表面、边框、文字层级     |
| accent   | 用户主色（red、orange、gold……，默认单色）           | 主按钮、链接、选中、焦点       |
| contrast | 先固定一个默认值，以后可开放给设置                  | 表面间距、边框可见度、文字对比 |

状态色（success /warning/error/info）是固定色相的种子，同样按 mode 和 contrast 推导 wash、border、text。

好处：

- 现有的主色、中性色选项照样能用，只是每个名字对应一个 OKLCH 种子，不再对应一张色阶表。
- 新增角色只需写一条推导规则，不用回引擎取值。
- 生成器是纯函数，所有 “主色 × 中性色 × 明暗” 组合的 WCAG 对比度都能在单测里逐一检查。现在做不到这点。
- 以后加高对比度主题只是改 contrast 输入。

默认值怎么定：用仓库已有的 Brave CDP 对照流程，量出 Linear 明暗两套主题渲染后的实际颜色（背景、表面、边框、各级文字、强调色），用它们来校准生成器的默认输入和推导系数。只借用公开博客描述的方法和实测的渲染结果，不复制 Linear 的源码。

需要你拍板（见文末）：默认配色是对齐 Linear，还是复现现在 LobeHub 的灰阶。

## 编辑器的处理

`@lobehub/editor` 有 74 个文件用 antd-style 的 `createStaticStyles` + `cssVar`，编译结果是 `var(--<prefix>-x, var(--ant-x))`，依赖文档上的 `--ant-*` 变量取色。

做法：生成器多输出一张别名表，只挂在编辑器根节点的 class 上（例如 `.orvilo-editor-scope { --ant-color-text: var(--foreground); … }`）。编辑器随本地主题一起变色，全局不再有 `--ant-*`。别名表需要的变量清单从 `node_modules/@lobehub/editor` 的 `cssVar.*` 用法里提取，测试锁住，升级编辑器时如果多出新变量，测试会失败。

## 阶段（每个 PR 只做一件事，目标 `canary`）

### P0 护栏与测量（已完成）

- 加一个计数测试：`src`、`packages`、`apps` 里 `var(--ant-` 的出现次数和 `@lobehub/ui` 的 import 文件数只能减少（棘轮），初始值写成基线。
- lint 不在 P0 打开：`eslint.config.mjs` 里同一文件的 `no-restricted-imports` 块后者覆盖前者，warn 级别会被各目录的 error 块冲掉，所以护栏由棘轮测试 `src/antdRetirementRatchet.test.ts` 承担，P5 再统一改成 error。`eslint.config.mjs` 自身 import 了 `@lobehub/ui/eslint` 的 `restrictedImports`，P5 要把其中仍需要的规则搬成本地常量。
- 提取编辑器实际使用的 `--ant-*` 变量清单，作为后面编辑器别名表的输入。
- 测量结果（`@lobehub/editor` 4.29.2，业务侧 128 个文件 import 它）：
  - 用到 39 个 `cssVar.*` token，含 `colorText*`、`colorFill*`、`colorBg*`、`colorPrimary*`、状态色及其 Bg / Border、`borderRadius*`、`boxShadowSecondary` / `Tertiary`、`fontFamilyCode`、`motionEaseOut`，以及色阶 `yellow`、`volcano10`、`geekblue10`、`purple10`。
  - 8 处 `useThemeMode`，依赖 antd-style 的 `ThemeProvider` context 判断明暗。
  - 内部渲染 `@lobehub/ui` 的 `ActionIcon`、`DropdownMenu`、`Popover`、`Highlighter`、`Mermaid`、`toast` 等，依赖 `LOBE_THEME_APP_ID` 与 `useAppElement` 的 portal 宿主。
  - 结论：编辑器外必须保留一层局部 lobehub `ThemeProvider`（`enableGlobalStyle={false}`、`enableCustomFonts={false}`），它的 `customTheme` 由本地生成器的输出驱动；`--ant-*` 别名挂在这层的根节点上。
- `@lobehub/icons`（业务侧 41 个文件）内部只用 `@lobehub/ui` 的 `Center`、`Flexbox`、`Icon`，以及 7 处 antd-style 静态样式，不依赖 provider context。

### P1 调用点改成语义角色（外观零变化）（已完成）

- 按 `docs/development/antd-style-to-tailwind.md` 已有的对应关系，把 628 处 `var(--ant-*)` 改成语义类或变量。文字四级（description /tertiary/secondary/quaternary）占大头，先做。
- 缺的角色（placeholder、disabled text、icon、link hover、primary active、z-index 弹层基准）先在 ThemeRoles 和 `globals.css` 里补上名字，值仍取引擎。
- 圆角用 `--radius-*` 角色，不用 `rounded-lg`。
- 原始色阶（`authorColor.ts`、`ExecutionStatus.ts`、图表色）收进 `src/styles/palette.ts`，不按 “看起来接近” 去套语义色。
- 可按目录拆成多个 PR。每个 PR 的验收：明暗两套截图与改动前逐像素一致。
- 结束时棘轮降到 0，lint 规则对 `var(--ant-` 改为 error。

### P2 本地颜色生成器（唯一有意改变外观的一步）（已完成）

- 新增 `src/styles/theme/`：`seeds.ts`（主色、中性色、状态色的 OKLCH 种子）、`generate.ts`（纯函数：输入 mode、base、accent、contrast，输出完整角色表和编辑器别名表）。
- ThemeRoles 改为调用生成器，不再读 Emotion `ThemeContext`。`globals.css` 的默认 `:root` / `.dark` 由同一生成器的默认输入算出，用测试保证两者一致。
- 启动骨架 `AppShellSkeleton.tsx` 和 `DesktopLayoutContainer/cssVariables.ts` 改读语义变量。
- 设置页色板 `ThemeSwatchesPrimary.tsx` 读 `seeds.ts`，不再 import `@lobehub/ui` 的 `primaryColors` / `neutralColors` / `findCustomThemeName`。
- 用户已存的主色、中性色名字保持不变，不需要数据迁移。
- 同一个 PR 更新 `DESIGN.md` 与 `DESIGN.dark.md`：颜色值改为生成器输出，说明生成规则。
- 测试：每种主色 × 中性色 × 明暗组合，正文与 secondary 文字在各自表面上达到 4.5:1，控件边界与焦点环达到 3:1。
- 验收：明暗、默认主色、一个非默认主色、一个非默认中性色，各截一组前后对比图；Issue 详情页与 Linear 同页并排对比。

### P3 Markdown 换成 Streamdown（已完成）

- 仓库已有 `streamdown` 2.7.0 和 `@streamdown/cjk`、`code`、`math`、`mermaid`。新增本地 Markdown 门面，入口仍是 `src/features/Conversation/Markdown/index.tsx`。
- 保留 `variant="chat"`、流式、用户字号档、代码主题、Mermaid 主题和现有 `pre: ChatCodeBlock`。93 个调用点只改 import。
- `Highlighter`、`PatchDiff`、`Mermaid`、`mdx` 的 `Pre` / `Image` 一并迁移。代码块走 `src/components/reui/code-block`，统一 diff 用已安装的 `diff`。
- 与 P1、P2 不冲突，可以并行。

### P4 组件替换（按组件族拆 PR）（已完成）

每一族一个 PR，调用点行为不变。完整符号清单见附录。

1. 布局与文字：`Flexbox`、`Center`、`Block`、`Text`、`Typography` → Tailwind。
2. 菜单：`DropdownMenu*`（约 40 处）、`menuSharedStyles`、`showContextMenu` / `closeContextMenu` / `ContextMenuHost` / `ContextMenuInterceptor` → `components/ui` 的 `dropdown-menu`、`context-menu`。
3. 浮层：`Modal`、`ModalHost`、`createModal`、`confirmModal`、`useModalContext`、`toast`、`ToastHost`、`FloatingPanel`、`FloatingSheet`、`Tooltip`、`TooltipGroup`、`setFloatingCollisionPadding` → `components/Modal`、`components/toast`、`ui/dialog`、`ui/sheet`、`ui/popover`、`ui/tooltip`。
4. 表单控件：`Button`、`Input`、`InputPassword`、`TextArea`、`InputNumber`、`Select`、`Switch`、`Slider`、`Segmented`、`Tabs`、`Tag`、`HotkeyInput`、`ImageSelect` → `components/ui`、`reui/number-field`、`ui/toggle-group`、`reui/badge`；`HotkeyInput` 写本地组件，沿用现有冲突判断。
5. 反馈：`Alert`、`Progress`、`Skeleton` → `components/ui` 同名组件。
6. 媒体与文件：`Image`（20 处）、`PreviewGroup`、`FileTypeIcon`、`MaterialFileTypeIcon`、`Avatar`、`GroupAvatar`、`EmojiPicker` → 新增本地 `Image` 与 lightbox 包装（需新装 `yet-another-react-lightbox`）、`components/FileIcon`（需新装 `react-file-icon`、`@iconify/react`）、`components/Avatar/AvatarGroup`、已安装的 `@emoji-mart/react`。
7. 面板与列表：`DraggablePanel` → 新增 shadcn resizable（需新装 `react-resizable-panels`），保留折叠、最小 / 最大宽度和已记住的宽度；`SortableList` → `reui/sortable`；`Accordion*` → `ui/accordion`；`Tree` → 本地实现或新增组件（ReUI 目前没有 tree）。
8. 图标：`@lobehub/ui/icons`（33 处，含 `SkillsIcon`、`McpIcon`、各家 SSO 图标）是 `@lobehub/ui` 的子路径，不是 `@lobehub/icons`。品牌图标改从 `@lobehub/icons` 取，其余改成本地 SVG 组件。
9. 工具函数与杂项：`copyToClipboard`、`stopPropagation`、`combineKeys`、`isFullHtmlDocument`、`Freeze`、`ErrorBoundary`、`HtmlPreview`、`CopyButton`、`FontLoader`、`Icon`、移动端 `ChatHeader` / `TabBarProps`、`chat` 的 `ChatItemProps`、`brand` 的 `LobeChatProps` → 本地实现或删除。

### P5 拆样式引擎（已完成）

- 四套主题壳（App、Auth、Share、Workbench）与 `src/utils/router.tsx` 的错误边界不再包 lobehub `ConfigProvider` / `ThemeProvider`。如果 P0 测出编辑器需要 context，只在编辑器外包一层局部 provider。
- 删除 antd `ConfigProvider`（`AuthLocale.tsx`、`SPAGlobalProvider/Locale.tsx` 等），日期改用本地 `components/DatePicker`，方向改用文档 `dir` 和逻辑属性。
- 删除三个 `entry.server.tsx` 里的 `extractStaticStyle` / `buildInlineAntdStyle`。
- 删除构建插件：`lobeStaticCssPlugin` 出现在 `apps/auth/vite.config.shared.mts`、`apps/share/vite.config.shared.mts`、`apps/workbench/vite.config.rr.mts`、`vitest.config.mts`、`plugins/vite/staticCssAliases.ts`。
- 删除 `AntdStyleLayer.tsx`、`globals.css` 里的 `antd/dist/reset.css` 与 `@layer antd`。
- `no-restricted-imports` 改为 error。

完成情况：

- 编辑器与图表的宿主是 `src/components/LobeThemeScope`（唯一允许 import `antd-style`、`@ant-design/cssinjs`、`@lobehub/ui` 的目录，lint 报错封口，棘轮同时检查导入只出现在这里）。实测发现 `@lobehub/charts`（6 个调用点，读 `useTheme` / `useThemeMode` / `cssVar`）同样依赖 lobehub context，因此一并包在这个 scope 里。
- scope 内是局部 lobehub `ThemeProvider`（`enableGlobalStyle={false}`、`enableCustomFonts={false}`），token 来自 `generateEngineToken(generateTheme(...))`；antd `App` 根节点带 `.orvilo-editor-scope`、`display: contents`，挂 `editorScopeCss()` 别名。lobehub 的 portal 宿主（`useAppElement`、`LOBE_THEME_APP_ID`）和 `ToastHost` 都在 scope 内，编辑器的弹层、菜单、图片预览和 toast 因此拿得到别名。
- 层叠：antd cssinjs 经 `StyleProvider layer` 进 `@layer antd`；emotion（antd-style）由 `installStyleLayer.ts` 在所有客户端入口最先打补丁，类规则写成 `@layer antd-style{:where(.orvilo-editor-scope) …}`，只能命中 scope 内的节点；全局片段（keyframes、`EssentialStyle`）只进层不加 scope。`globals.css` 的层顺序是 `theme, base, antd, antd-style, components, utilities`。因此 `@ant-design/cssinjs` 仍保留为依赖。
- 详细设计、残留全局选择器和需要在运行中确认的风险见 `docs/development/antd-global-style-layer.md`。

### P6 收尾（代码部分已完成，运行中文档核查待做）

- `package.json`：`@ant-design/cssinjs` 如无运行时使用者则删除；`antd`、`antd-style`、`@lobehub/ui` 因编辑器和图标的 peer 依赖保留，注明原因。builtin-tool 包里只声明不使用的 antd peer 删除。
- 最后一轮在运行中的 Electron 文档里确认：没有 antd reset；没有未进 layer 的 lobehub 规则命中编辑器以外的节点；文档根上没有 `--ant-*`。
- 更新 `docs/development/antd-global-style-layer.md`、迁移文档和 react skill 里 “继续使用 `@lobehub/ui`” 的优先级。

完成情况：

- 根 `package.json` 保留 `antd`、`antd-style`、`@lobehub/ui`（`@lobehub/editor`、`@lobehub/charts`、`@lobehub/icons` 的 peer 依赖，运行时确有 import）和 `@ant-design/cssinjs`（LobeThemeScope 用它把 antd cssinjs 放进 `@layer antd`）。JSON 不能写注释，原因记在本文件与 `antd-global-style-layer.md`。
- 三个微应用不再声明 `@ant-design/cssinjs`；builtin-tool 等包里只声明不使用的 `antd`、`antd-style`、`@lobehub/ui` peer 全部删除。新增 `katex`（KaTeX 样式改为本地打包，版本与 `@streamdown/math` 一致）。
- 棘轮基线：`--ant-*` 0；`antd` 0；`antd-style` 1、`@ant-design/cssinjs` 1、`@lobehub/ui` 2，全部在 `src/components/LobeThemeScope`。
- 待做：在运行中的 Electron 文档里按 `antd-global-style-layer.md` 末尾的清单核查。

### P7 编辑器换成 shadcn-editor（真正去掉 antd）

P5 之后业务代码不再 import 这些包，但 `@lobehub/editor` 仍在运行时把 `antd-style`、`@lobehub/ui` 和（经 `@lobehub/ui`）`antd` 带进产品。它的工具栏、菜单、弹层由 LobeHub 绘制，样式靠 `LobeThemeScope` 的别名表和 `@layer` 关在 scope 里。这能挡住层叠冲突，但仍是第二套组件与 token 体系，编辑器升级也可能再带进新的全局样式。只有换掉编辑器，三个依赖才能从 `package.json` 删除。

选型：[shadcn-editor](https://github.com/htmujahid/shadcn-editor)（MIT）。

- 底层同为 Lexical，存储格式仍是 Lexical JSON，不用换存储格式；只有 LobeHub 专有的节点类型要做一次性转换（见步骤 2）；服务端无头编辑器（`apps/server/src/services/agentDocuments/headlessEditor.ts`、`toolExecution/serverRuntimes/pageAgent.ts`）可以继续用 Lexical 实现。
- 组件是 shadcn/ui 加 Tailwind，不依赖 antd、antd-style、`@lobehub/*`、Emotion；颜色直接读本地生成器的语义变量。
- 已有插件覆盖：聊天输入（`chat-input-plugin`）、@提及（`mention-plugin`）、斜杠菜单（`component-picker`）、工具栏与浮动工具栏、表格、代码块、拖拽块、Markdown 转换器。
- 按 shadcn registry 方式拷进仓库（`npx shadcn add @shadcn-editor/editor-x`），代码归我们维护，不作为运行时依赖。

备选：Plate（Slate）、Tiptap 系（Novel、minimal-tiptap、BlockNote）。它们都要换引擎，需要迁移已存文档，只有在 shadcn-editor 验证不通过时才考虑。

目标形态（2026/10/15 拍板）：完全换成 shadcn-editor 的 “Editor X” 形态（[演示](https://shadcn-editor.vercel.app)）：顶部完整工具栏（块类型、字体、字号、颜色、格式、对齐、缩进、代码、分栏、emoji、公式、分隔线、图片、表格、清除格式、导入导出）、斜杠菜单、块拖拽手柄与插入按钮、选中文字的浮动工具栏、@提及、emoji、输入时 Markdown 快捷方式、底部字数统计栏。聊天输入框用同一套编辑器内核的精简形态（chat-input 插件），不带顶部工具栏。

取舍原则（2026/10/15 拍板）：

- shadcn-editor 已有的功能直接复用它的实现，不追求与 `@lobehub/editor` 的外观和交互完全一致。
- shadcn-editor 没有的功能直接不要，不为对齐 LobeHub 补写。
- 必须保留的关键交互：@提及（`mention-plugin`）、斜杠命令菜单（`component-picker`）、聊天输入的发送 / 停止与回车提交（`chat-input-plugin`）。
- 随之放弃的 LobeHub 功能：LiteXML 格式与按节点 ID 改文档、文档内的 AI 改动审阅（`diff` 节点、逐条 / 全部接受与拒绝、`DiffAllToolbar`）、LobeHub 专有的块类型与工具栏样式。

Markdown：shadcn-editor 的 Markdown 不是源码模式编辑器，而是 Lexical 官方 `@lexical/markdown` 加几个自定义 transformer（表格、分隔线、图片、emoji）。我们一并采用：

- 输入时的 Markdown 快捷方式（`## ` 变标题、`- ` 变列表、反引号变代码等），用于文档编辑器和聊天输入框。
- 同一套 transformer 负责文档与 Markdown 的互转，替代 `@lobehub/editor` 的 `MarkdownPlugin`。AI 读写文档统一走 Markdown。
- 不做源码 / 预览双栏的 Markdown 编辑模式。`CodeEditorPane` 用的是 `@lobehub/editor/codemirror`（编辑代码与纯文本文件），与此无关，单独换成直接使用 CodeMirror 6。

步骤（每步一个 PR，目标 `canary`）：

1. **Lexical 升级验证**：shadcn-editor 用 Lexical 0.52，我们与 `@lobehub/editor` 锁在 0.42。先在分支上把 Lexical 升到 0.52，确认 `@lobehub/editor` 仍能运行。能跑，迁移期两个编辑器可以共存，按页面逐步换；不能跑，就只能在一个 PR 里一次性切换，不留共存期。同一个应用不装两个 Lexical 版本。
2. **旧文档兼容**：列出 `@lobehub/editor` 注册的全部节点类型，分三类处理。shadcn-editor 有对应节点的（标题、列表、表格、代码、链接、图片、提及等）在加载时映射过去；没有对应、但内容需要保留的，降级成段落或纯文本；`diff` / `diff-content` 等未处理的 AI 建议，按 “拒绝” 处理，保留原文。先写一次性迁移，把已存文档转换一遍，再上线新编辑器。测试：用真实的旧文档 JSON 跑迁移，新编辑器能完整加载，文字内容不丢。
3. **聊天输入框**（`src/features/ChatInput`，约 34 个文件）：用 shadcn-editor 的 `chat-input-plugin`、`mention-plugin`、`component-picker` 和 Markdown 快捷方式重写；操作栏与附件复用仓库已有的 AI Elements `prompt-input`；快捷键沿用现有 hotkey 配置。范围最清楚，先做。
4. **文档与页面编辑器**（`PageEditor`、`EditorCanvas`、`EditorModal`、`AgentTasks`、`TaskDrafts`、`Projects` 等）：换成 shadcn-editor 的工具栏、浮动工具栏、表格、列表、链接、图片、拖拽块和 Markdown 互转；`LexicalRenderer` 只读渲染改为同一套节点以只读模式渲染。
5. **AI 改文档**：去掉 LiteXML 与 `diff` 审阅。`builtin-tool-page-agent` 的 `getPageContent` 返回 Markdown；`modifyNodes` 删除，改动统一走 `replaceText`（按原文片段替换）或整篇 Markdown 写回，直接生效。撤销靠编辑器历史与文档版本历史（参照现有 `WorkVersionHistoryCard`）。`packages/editor-runtime` 与服务端无头编辑器改用 `@lexical/headless` 加同一套 Markdown transformer。更新 page-agent 与 agent-documents 的 system prompt 和测试。
6. **图表与图标**：除编辑器外，根依赖里只有 `@lobehub/charts` 与 `@lobehub/icons` 还把 `antd`、`antd-style`、`@lobehub/ui` 带进来。两者不依赖编辑器进度，各开一个 PR，可以先于步骤 1–5 做。
   - **图表**（`@lobehub/charts`，7 个文件）：用到 `RadarChart`、`BarChart`、`ChartTooltipFrame`、`ChartTooltipRow`、`CategoryBar`、`useThemeColorRange`，在模型对比与用量统计里。它内部就是 recharts 外包 antd-style。换成 shadcn chart（同样基于 recharts，根 `package.json` 新增 `recharts`），颜色读本地生成器的 `--chart-*` 角色；`CategoryBar`（分段比例条）没有对应组件，用 div 写本地组件。验收：对比前后截图，tooltip、图例、明暗配色正常。
   - **图标**（`@lobehub/icons`，41 个文件）：多数是品牌图标（`Github` 11 处，另有 `Ollama`、`Microsoft`、`Google`、`MCP`、`Codex`、`ClaudeCode`、`Notion`、`Cursor`、`Aws`、`Apple`、`Cloudflare`、`Exa`、`Unsloth` 等），加上按名字选图标的 `ProviderIcon`、`ProviderCombine`、`providerMappings`、`IconType`。单个图标的 `Mono` 是纯 SVG，但包入口会连带加载 `Avatar` / `Combine` 和 `features/*`，后者依赖 `@lobehub/ui`。做法：把实际用到的品牌图标 SVG 拷成本地组件，放在 `src/components/icons/brand/`（P4 已这样处理登录页图标；源包 MIT，保留许可声明）；`ProviderIcon` 等改成本地 “服务商 / 模型名 → 本地图标” 映射表，只覆盖产品实际支持的服务商与模型，缺图标时回退到首字母。测试锁住映射表覆盖 `model-bank` 里所有启用的服务商。
   - **依赖声明**：删除 `packages/builtin-tools`、`packages/heterogeneous-agents` 里的 `@lobehub/icons`，以及 `packages/builtin-tool-orvilo-agent`、`packages/editor-runtime` 里的 `@lobehub/editor`（后者随步骤 5 一起）。
7. **删除依赖**：删掉 `src/components/LobeThemeScope`、`installStyleLayer.ts`、`globals.css` 里的 `antd` / `antd-style` 层和编辑器别名表；`package.json` 删除 `@lobehub/editor`、`@lobehub/charts`、`@lobehub/icons`、`antd`、`antd-style`、`@ant-design/cssinjs`、`@lobehub/ui`；棘轮把 `@lobehub/editor`、`@lobehub/charts`、`@lobehub/icons` 也纳入计数，基线全部归零，lint 不留例外。

P7 完成后，“结束时同时成立” 里关于保留 `@lobehub/editor` 及其 peer 依赖的那一条作废，改为：`package.json` 不含 `antd`、`antd-style`、`@ant-design/cssinjs`、`@lobehub/ui`。

验收：

- 聊天页与文档页在 Electron 明暗两种外观下截图，附 commit SHA。
- 运行中的文档里没有 `--ant-*`，也没有任何 antd 或 Emotion 注入的样式表。
- 旧文档经迁移后能打开、编辑、保存，文字内容不丢；@提及、斜杠命令、Markdown 快捷方式可用；AI 通过 Markdown 改文档端到端可用。

## 验证要求

- 每个改产品行为的 PR：在真实 Electron 里明暗两种外观走受影响路径，截图附在 PR 上，注明 commit SHA。
- P1：前后截图逐像素一致。
- P2：额外切一个非默认主色和一个非默认中性色；Issue 详情页与 Linear 并排对比。
- 静态截图不能证明层叠冲突已消失，P6 必须在运行中的文档里检查样式表与计算样式。

## 不做的事

- 不重做 Settings 供应商页和 ModelSwitchPanel 的布局，只在共用符号被替换时改 import。
- 不引入 react-hook-form 去替代现有表单；GroupForm 已是本地表单。
- 不在退役过程中做 taste /redesign 式的视觉改造。视觉打磨在 P6 之后单独进行。

## 已拍板 (2026/10/15)

1. 默认配色：对齐 Linear 实测值。底色、表面、边框、文字层级、状态色按 Linear 明暗两套主题的渲染结果校准。
2. 默认主色：保持现在的单色（浅色模式近黑、深色模式近白），不用 Linear 的蓝紫色。用户选了具名主色时，才用该主色作为 accent。
3. 对比度：只做生成器的内部输入，固定一个默认值，不在外观设置里开放。

## 附录：canary 上 `@lobehub/ui` 符号使用量

| 子路径                      | import 次数 |
| --------------------------- | ----------- |
| `@lobehub/ui`               | 210         |
| `@lobehub/ui/base-ui`       | 49          |
| `@lobehub/ui/icons`         | 33          |
| `@lobehub/ui/mobile`        | 9           |
| `@lobehub/ui/mdx`           | 5           |
| `@lobehub/ui/static-css/*`  | 6           |
| `@lobehub/ui/chat`、`brand` | 3           |

用量最高的符号：`Markdown` 93、`Flexbox` 21、`SkillsIcon` 18、`Image` 17、`ThemeProvider` 8、`ChatHeader` 8、`DraggablePanel` 7、`Select` 7、`toast` 7、`PreviewGroup` 6、`DropdownMenuPopup` / `Portal` / `Positioner` 各 6。
