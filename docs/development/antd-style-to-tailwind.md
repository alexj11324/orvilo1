# antd-style → Tailwind migration: phase 0

Tracking issue: [#577](https://github.com/alexj11324/orvilo1/issues/577).
This is a **reviewable sample, not approval for bulk migration**. Stacked on
`feat/ai-elements-chatbot` / #580 as requested. Inventory source is
`9ec2b3fe249f8457cd67ef43d94aed4c9f56e3f7` (2026-10-09).
Earlier assistant-ui and Orbs worktrees remain separate.

## Verified sources and interpretation

Read [DESIGN.md](../../DESIGN.md), [ThemeRoles](../../src/styles/themeRoles.ts),
[globals.css](../../src/app/globals.css) and the existing component consumers.
ThemeRoles assigns resolved engine values on the actual application theme host;
globals.css exposes them through Tailwind v4 `@theme inline`. Fixed dimensions below
come from DESIGN and the existing component-radius roles, not invented theme values.
The table covers every **132** distinct `cssVar.*` name found in tracked TS/TSX/CSS
under src/packages/apps at this source (the issue's 133 was an earlier baseline).
A row marked unmapped is not a license to select the closest-looking utility.

Baseline lexical inventory (tracked TS/TSX/CSS only): 1,328 files importing
antd-style, 26 importing antd, 951 calling createStaticStyles, 1,110 containing
cssVar references and 542 calling cx. These are file counts, not AST call counts;
comments can contribute to the reference counts. This sample removes five direct
antd-style imports (1,323 remain), not the transitive dependencies.

Important corrections to the issue's illustrative examples:

- `colorTextDescription` has no direct local alias. `--muted-foreground` resolves
  **colorTextSecondary**; do not silently merge description/tertiary/disabled tones.
- `--border` resolves **colorBorder**, while `--sidebar-border` resolves
  **colorBorderSecondary**. The existing sidebar-named alias is the only exact
  local mapping for that subtle-border value; the OAuth connector sample uses it
  explicitly. Owner may later introduce a general divider role; this PR does not.
- `--input` is a 50% mix of border and text; it is not either raw engine color.
- Status `*-subtle` is a computed 10% wash, `*-text` is contrast-adjusted and
  `*-on-fill` is computed readable text. Raw `*Bg`, `*Text`, `colorWhite` and
  `colorTextLightSolid` are **not** automatically equivalent.
- `--shadow-dialog` deliberately becomes none in dark mode. It is not a globally
  exact replacement for `boxShadow`; review the consumer's elevation purpose.
- Generic rounded-lg/xl currently resolve to 10/14px. DESIGN button/card and
  overlay roles are 8/12px. Keep the explicit component radius role.

## Direct aliases and fixed DESIGN roles

`bg-`, `text-`, `border-`, `fill-`, `stroke-` and outline utilities must follow the
original CSS property. A raw status fill used as text does not prove contrast;
changing it to contrast-adjusted status text requires separate visual review.
Dynamic theme customization of a dimension needs an explicit decision before using
its fixed DESIGN role. The five samples use existing literal dimensions only.

| cssVar                 | Tailwind / semantic expression               | Source check / restriction                                                                                                                              |
| ---------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `borderRadius`         | `rounded-(--radius-card)`                    | Fixed DESIGN card role; globals.css component radius. Choose button role for buttons; no generic rounded-lg/xl substitution.                            |
| `borderRadiusLG`       | `rounded-(--radius-overlay)`                 | Fixed DESIGN overlay role; globals.css component radius. Choose button role for buttons; no generic rounded-lg/xl substitution.                         |
| `borderRadiusSM`       | `rounded-(--radius-input)`                   | Fixed DESIGN input role; globals.css component radius. Choose button role for buttons; no generic rounded-lg/xl substitution.                           |
| `borderRadiusXS`       | `rounded-(--radius-chip)`                    | Fixed DESIGN chip role; globals.css component radius. Choose button role for buttons; no generic rounded-lg/xl substitution.                            |
| `boxShadowSecondary`   | `shadow-(--shadow-popover)`                  | ThemeRoles assigns --shadow-popover directly from theme.boxShadowSecondary.                                                                             |
| `colorBgContainer`     | `bg-card`                                    | ThemeRoles assigns --card directly from theme.colorBgContainer.                                                                                         |
| `colorBgElevated`      | `bg-popover`                                 | ThemeRoles assigns --popover directly from theme.colorBgElevated.                                                                                       |
| `colorBgLayout`        | `bg-background`                              | ThemeRoles assigns --background directly from theme.colorBgLayout.                                                                                      |
| `colorBorder`          | `border-border`                              | ThemeRoles assigns --border directly from theme.colorBorder.                                                                                            |
| `colorBorderSecondary` | `border-sidebar-border / bg-sidebar-border`  | ThemeRoles assigns --sidebar-border directly from theme.colorBorderSecondary.                                                                           |
| `colorError`           | `text-destructive / bg-destructive`          | ThemeRoles assigns --destructive directly from theme.colorError.                                                                                        |
| `colorFillSecondary`   | `bg-selected`                                | ThemeRoles assigns --selected directly from theme.colorFillSecondary.                                                                                   |
| `colorFillTertiary`    | `bg-accent / bg-muted / bg-secondary`        | ThemeRoles assigns --accent / --muted / --secondary directly from theme.colorFillTertiary.                                                              |
| `colorInfo`            | `text-info / bg-info`                        | ThemeRoles assigns --info directly from theme.colorInfo.                                                                                                |
| `colorPrimary`         | `text-primary / bg-primary / border-primary` | ThemeRoles assigns --primary directly from theme.colorPrimary.                                                                                          |
| `colorPrimaryHover`    | `text-primary-hover / bg-primary-hover`      | ThemeRoles assigns --primary-hover directly from theme.colorPrimaryHover.                                                                               |
| `colorSuccess`         | `text-success / bg-success`                  | ThemeRoles assigns --success directly from theme.colorSuccess.                                                                                          |
| `colorText`            | `text-foreground`                            | ThemeRoles assigns --foreground directly from theme.colorText.                                                                                          |
| `colorTextSecondary`   | `text-muted-foreground`                      | ThemeRoles assigns --muted-foreground directly from theme.colorTextSecondary.                                                                           |
| `colorWarning`         | `text-warning / bg-warning`                  | ThemeRoles assigns --warning directly from theme.colorWarning.                                                                                          |
| `fontFamily`           | `font-sans`                                  | ThemeRoles assigns --font-sans directly from theme.fontFamily.                                                                                          |
| `fontFamilyCode`       | `font-mono`                                  | ThemeRoles assigns --font-mono directly from theme.fontFamilyCode.                                                                                      |
| `fontSize`             | `text-sm leading-[inherit]`                  | DESIGN fixed 12/14/16px type role. Preserve inherited line-height when old declaration only sets font-size; audit customized runtime tokens separately. |
| `fontSizeLG`           | `text-base leading-[inherit]`                | DESIGN fixed 12/14/16px type role. Preserve inherited line-height when old declaration only sets font-size; audit customized runtime tokens separately. |
| `fontSizeSM`           | `text-xs leading-[inherit]`                  | DESIGN fixed 12/14/16px type role. Preserve inherited line-height when old declaration only sets font-size; audit customized runtime tokens separately. |
| `fontWeightStrong`     | `font-semibold`                              | DESIGN fixed strong weight 600.                                                                                                                         |
| `lineHeight`           | `leading-[1.5714]`                           | DESIGN body line-height value; no dynamic alias, do not replace with text-sm default leading-5.                                                         |
| `lineHeightSM`         | `leading-[1.6667]`                           | DESIGN small-text line-height value; no dynamic alias, do not replace with text-xs default leading-4.                                                   |
| `margin`               | `m-4`                                        | DESIGN fixed 4px spacing rhythm; select logical axis (ps/pe/pt/pb etc.) from original property, not token name.                                         |
| `marginLG`             | `m-6`                                        | DESIGN fixed 4px spacing rhythm; select logical axis (ps/pe/pt/pb etc.) from original property, not token name.                                         |
| `marginMD`             | `m-5`                                        | DESIGN fixed 4px spacing rhythm; select logical axis (ps/pe/pt/pb etc.) from original property, not token name.                                         |
| `marginSM`             | `m-3`                                        | DESIGN fixed 4px spacing rhythm; select logical axis (ps/pe/pt/pb etc.) from original property, not token name.                                         |
| `marginXS`             | `m-2`                                        | DESIGN fixed 4px spacing rhythm; select logical axis (ps/pe/pt/pb etc.) from original property, not token name.                                         |
| `marginXXS`            | `m-1`                                        | DESIGN fixed 4px spacing rhythm; select logical axis (ps/pe/pt/pb etc.) from original property, not token name.                                         |
| `motionDurationFast`   | `duration-(--orvilo-motion-fast)`            | ThemeRoles direct duration alias; set transition properties explicitly and check motion-off semantics.                                                  |
| `motionDurationMid`    | `duration-(--orvilo-motion-mid)`             | ThemeRoles direct duration alias; set transition properties explicitly and check motion-off semantics.                                                  |
| `motionDurationSlow`   | `duration-(--orvilo-motion-slow)`            | ThemeRoles direct duration alias; set transition properties explicitly and check motion-off semantics.                                                  |
| `padding`              | `p-4`                                        | DESIGN fixed 4px spacing rhythm; select logical axis (ps/pe/pt/pb etc.) from original property, not token name.                                         |
| `paddingLG`            | `p-6`                                        | DESIGN fixed 4px spacing rhythm; select logical axis (ps/pe/pt/pb etc.) from original property, not token name.                                         |
| `paddingMD`            | `p-5`                                        | DESIGN fixed 4px spacing rhythm; select logical axis (ps/pe/pt/pb etc.) from original property, not token name.                                         |
| `paddingSM`            | `p-3`                                        | DESIGN fixed 4px spacing rhythm; select logical axis (ps/pe/pt/pb etc.) from original property, not token name.                                         |
| `paddingXL`            | `p-8`                                        | DESIGN fixed 4px spacing rhythm; select logical axis (ps/pe/pt/pb etc.) from original property, not token name.                                         |
| `paddingXS`            | `p-2`                                        | DESIGN fixed 4px spacing rhythm; select logical axis (ps/pe/pt/pb etc.) from original property, not token name.                                         |
| `paddingXXS`           | `p-1`                                        | DESIGN fixed 4px spacing rhythm; select logical axis (ps/pe/pt/pb etc.) from original property, not token name.                                         |

## Unmapped variables: owner decision required

Keep consumers of these values in the later exception/phase-3 inventory until the
frontend owner chooses an existing role or approves a new token in a separate
change. No approximate mapping or hard-coded color is proposed here. Owner for
all pending entries: frontend owner (issue #577). Links identify one tracked
consumer; they are examples, not a complete exception allowlist.

| cssVar                     | Why no exact existing semantic mapping                                                                              | Example consumer                                                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `blue10`                   | Raw palette token; no semantic-role alias. Do not map a hue by visual similarity.                                   | [src/features/Acceptance/Viewer/Comments/authorColor.ts](../../src/features/Acceptance/Viewer/Comments/authorColor.ts)                                                                       |
| `blue3`                    | Raw palette token; no semantic-role alias. Do not map a hue by visual similarity.                                   | [src/features/AgentGoals/ProcessControl/shared.tsx](../../src/features/AgentGoals/ProcessControl/shared.tsx)                                                                                 |
| `blue7`                    | Raw palette token; no semantic-role alias. Do not map a hue by visual similarity.                                   | [src/features/Acceptance/Viewer/Comments/authorColor.ts](../../src/features/Acceptance/Viewer/Comments/authorColor.ts)                                                                       |
| `boxShadow`                | Dialog shadow differs in dark mode; consumer elevation must be reviewed.                                            | [packages/builtin-tool-agent-documents/src/client/Render/CreateDocument/DocumentCard.tsx](../../packages/builtin-tool-agent-documents/src/client/Render/CreateDocument/DocumentCard.tsx)     |
| `boxShadowTertiary`        | Raised-card elevation has no local shadow alias.                                                                    | [packages/builtin-tool-knowledge-base/src/client/Render/SearchKnowledgeBase/Item/style.ts](../../packages/builtin-tool-knowledge-base/src/client/Render/SearchKnowledgeBase/Item/style.ts)   |
| `colorBgBase`              | No direct ThemeRoles assignment for this engine role; status washes/text and neutral ranks are not interchangeable. | [src/features/Electron/titlebar/WinControl.tsx](../../src/features/Electron/titlebar/WinControl.tsx)                                                                                         |
| `colorBgContainerDisabled` | No direct ThemeRoles assignment for this engine role; status washes/text and neutral ranks are not interchangeable. | [src/features/PluginDevModal/MCPManifestForm/MCPTypeSelect.tsx](../../src/features/PluginDevModal/MCPManifestForm/MCPTypeSelect.tsx)                                                         |
| `colorBgMask`              | No direct ThemeRoles assignment for this engine role; status washes/text and neutral ranks are not interchangeable. | [src/components/AvatarUpload/index.tsx](../../src/components/AvatarUpload/index.tsx)                                                                                                         |
| `colorBgTextHover`         | No direct ThemeRoles assignment for this engine role; status washes/text and neutral ranks are not interchangeable. | [src/features/CommandMenu/styles.ts](../../src/features/CommandMenu/styles.ts)                                                                                                               |
| `colorErrorBg`             | No direct ThemeRoles assignment for this engine role; status washes/text and neutral ranks are not interchangeable. | [packages/builtin-tool-claude-code/src/client/Inspector/Worktree.tsx](../../packages/builtin-tool-claude-code/src/client/Inspector/Worktree.tsx)                                             |
| `colorErrorBgHover`        | No direct ThemeRoles assignment for this engine role; status washes/text and neutral ranks are not interchangeable. | [src/features/DailyBrief/BriefIcon.tsx](../../src/features/DailyBrief/BriefIcon.tsx)                                                                                                         |
| `colorErrorBorder`         | No direct ThemeRoles assignment for this engine role; status washes/text and neutral ranks are not interchangeable. | [packages/builtin-tool-agent-documents/src/client/Inspector/RemoveDocument/index.tsx](../../packages/builtin-tool-agent-documents/src/client/Inspector/RemoveDocument/index.tsx)             |
| `colorErrorText`           | No direct ThemeRoles assignment for this engine role; status washes/text and neutral ranks are not interchangeable. | [src/features/Acceptance/Report/EvidenceComparisonCard.tsx](../../src/features/Acceptance/Report/EvidenceComparisonCard.tsx)                                                                 |
| `colorErrorTextActive`     | No direct ThemeRoles assignment for this engine role; status washes/text and neutral ranks are not interchangeable. | [src/features/Acceptance/Run/RunResult.tsx](../../src/features/Acceptance/Run/RunResult.tsx)                                                                                                 |
| `colorFill`                | No direct ThemeRoles assignment for this engine role; status washes/text and neutral ranks are not interchangeable. | [src/components/Branding/ProductLogo/Custom.tsx](../../src/components/Branding/ProductLogo/Custom.tsx)                                                                                       |
| `colorFillAlter`           | No direct ThemeRoles assignment for this engine role; status washes/text and neutral ranks are not interchangeable. | [src/features/MCP/MCPSettings/index.tsx](../../src/features/MCP/MCPSettings/index.tsx)                                                                                                       |
| `colorFillContent`         | No direct ThemeRoles assignment for this engine role; status washes/text and neutral ranks are not interchangeable. | [packages/builtin-tool-web-browsing/src/client/Render/Search/ConfigForm/style.tsx](../../packages/builtin-tool-web-browsing/src/client/Render/Search/ConfigForm/style.tsx)                   |
| `colorFillQuaternary`      | No direct ThemeRoles assignment for this engine role; status washes/text and neutral ranks are not interchangeable. | [packages/builtin-tool-agent-builder/src/client/Render/components/PromptDiffView.tsx](../../packages/builtin-tool-agent-builder/src/client/Render/components/PromptDiffView.tsx)             |
| `colorIcon`                | No direct ThemeRoles assignment for this engine role; status washes/text and neutral ranks are not interchangeable. | [src/features/ResourceManager/components/Explorer/ToolBar/ActionIconWithChevron.tsx](../../src/features/ResourceManager/components/Explorer/ToolBar/ActionIconWithChevron.tsx)               |
| `colorInfoBg`              | No direct ThemeRoles assignment for this engine role; status washes/text and neutral ranks are not interchangeable. | [packages/builtin-tool-task/src/client/Inspector/SetTaskSchedule/index.tsx](../../packages/builtin-tool-task/src/client/Inspector/SetTaskSchedule/index.tsx)                                 |
| `colorInfoBgHover`         | No direct ThemeRoles assignment for this engine role; status washes/text and neutral ranks are not interchangeable. | [src/features/Acceptance/Report/VisualizationRenderer.tsx](../../src/features/Acceptance/Report/VisualizationRenderer.tsx)                                                                   |
| `colorInfoBorder`          | No direct ThemeRoles assignment for this engine role; status washes/text and neutral ranks are not interchangeable. | [src/features/Acceptance/Report/ReportViewer.tsx](../../src/features/Acceptance/Report/ReportViewer.tsx)                                                                                     |
| `colorInfoText`            | No direct ThemeRoles assignment for this engine role; status washes/text and neutral ranks are not interchangeable. | [src/features/Acceptance/Report/ReportViewer.tsx](../../src/features/Acceptance/Report/ReportViewer.tsx)                                                                                     |
| `colorLink`                | No direct ThemeRoles assignment for this engine role; status washes/text and neutral ranks are not interchangeable. | [packages/builtin-tool-claude-code/src/client/Render/WebSearch/index.tsx](../../packages/builtin-tool-claude-code/src/client/Render/WebSearch/index.tsx)                                     |
| `colorLinkActive`          | No direct ThemeRoles assignment for this engine role; status washes/text and neutral ranks are not interchangeable. | [src/features/AuthShell/AuthAgreement.tsx](../../src/features/AuthShell/AuthAgreement.tsx)                                                                                                   |
| `colorLinkHover`           | No direct ThemeRoles assignment for this engine role; status washes/text and neutral ranks are not interchangeable. | [src/features/Conversation/Markdown/plugins/Link/Render/LinkChip.tsx](../../src/features/Conversation/Markdown/plugins/Link/Render/LinkChip.tsx)                                             |
| `colorPrimaryActive`       | No direct ThemeRoles assignment for this engine role; status washes/text and neutral ranks are not interchangeable. | [src/features/ChatInput/Dictation/index.tsx](../../src/features/ChatInput/Dictation/index.tsx)                                                                                               |
| `colorPrimaryBg`           | No direct ThemeRoles assignment for this engine role; status washes/text and neutral ranks are not interchangeable. | [packages/builtin-tool-agent-management/src/client/Render/SearchAgent/index.tsx](../../packages/builtin-tool-agent-management/src/client/Render/SearchAgent/index.tsx)                       |
| `colorPrimaryBgHover`      | No direct ThemeRoles assignment for this engine role; status washes/text and neutral ranks are not interchangeable. | [packages/shared-tool-ui/src/styles.ts](../../packages/shared-tool-ui/src/styles.ts)                                                                                                         |
| `colorPrimaryBorder`       | No direct ThemeRoles assignment for this engine role; status washes/text and neutral ranks are not interchangeable. | [src/components/Cell/index.tsx](../../src/components/Cell/index.tsx)                                                                                                                         |
| `colorPrimaryBorderHover`  | No direct ThemeRoles assignment for this engine role; status washes/text and neutral ranks are not interchangeable. | [src/features/AgentTasks/AgentTaskList/KanbanColumn.tsx](../../src/features/AgentTasks/AgentTaskList/KanbanColumn.tsx)                                                                       |
| `colorPrimaryText`         | No direct ThemeRoles assignment for this engine role; status washes/text and neutral ranks are not interchangeable. | [src/features/Collaboration/AgentActionCursor.tsx](../../src/features/Collaboration/AgentActionCursor.tsx)                                                                                   |
| `colorSplit`               | No direct ThemeRoles assignment for this engine role; status washes/text and neutral ranks are not interchangeable. | [packages/builtin-tool-claude-code/src/client/Render/WebSearch/index.tsx](../../packages/builtin-tool-claude-code/src/client/Render/WebSearch/index.tsx)                                     |
| `colorSuccessBg`           | No direct ThemeRoles assignment for this engine role; status washes/text and neutral ranks are not interchangeable. | [packages/builtin-tool-remote-device/src/client/Render/DeviceCard/index.tsx](../../packages/builtin-tool-remote-device/src/client/Render/DeviceCard/index.tsx)                               |
| `colorSuccessBgHover`      | No direct ThemeRoles assignment for this engine role; status washes/text and neutral ranks are not interchangeable. | [src/features/DailyBrief/BriefIcon.tsx](../../src/features/DailyBrief/BriefIcon.tsx)                                                                                                         |
| `colorSuccessBorder`       | No direct ThemeRoles assignment for this engine role; status washes/text and neutral ranks are not interchangeable. | [src/features/Acceptance/Report/EvidenceComparisonCard.tsx](../../src/features/Acceptance/Report/EvidenceComparisonCard.tsx)                                                                 |
| `colorSuccessText`         | No direct ThemeRoles assignment for this engine role; status washes/text and neutral ranks are not interchangeable. | [src/features/Acceptance/Report/EvidenceComparisonCard.tsx](../../src/features/Acceptance/Report/EvidenceComparisonCard.tsx)                                                                 |
| `colorSuccessTextActive`   | No direct ThemeRoles assignment for this engine role; status washes/text and neutral ranks are not interchangeable. | [src/features/Acceptance/Run/RunResult.tsx](../../src/features/Acceptance/Run/RunResult.tsx)                                                                                                 |
| `colorTextDescription`     | No direct ThemeRoles assignment for this engine role; status washes/text and neutral ranks are not interchangeable. | [packages/builtin-tool-activator/src/client/Inspector/ActivateSkill/index.tsx](../../packages/builtin-tool-activator/src/client/Inspector/ActivateSkill/index.tsx)                           |
| `colorTextDisabled`        | No direct ThemeRoles assignment for this engine role; status washes/text and neutral ranks are not interchangeable. | [src/features/PluginDevModal/PluginPreview/ApiVisualizer.tsx](../../src/features/PluginDevModal/PluginPreview/ApiVisualizer.tsx)                                                             |
| `colorTextHeading`         | No direct ThemeRoles assignment for this engine role; status washes/text and neutral ranks are not interchangeable. | [src/features/MCP/MCPSettings/index.tsx](../../src/features/MCP/MCPSettings/index.tsx)                                                                                                       |
| `colorTextLightSolid`      | No direct ThemeRoles assignment for this engine role; status washes/text and neutral ranks are not interchangeable. | [src/components/AvatarUpload/index.tsx](../../src/components/AvatarUpload/index.tsx)                                                                                                         |
| `colorTextPlaceholder`     | No direct ThemeRoles assignment for this engine role; status washes/text and neutral ranks are not interchangeable. | [src/features/AgentTasks/AgentTaskDetail/taskDetailLayoutStyles.ts](../../src/features/AgentTasks/AgentTaskDetail/taskDetailLayoutStyles.ts)                                                 |
| `colorTextQuaternary`      | No direct ThemeRoles assignment for this engine role; status washes/text and neutral ranks are not interchangeable. | [packages/builtin-tool-agent-documents/src/client/Inspector/\_styles.ts](../../packages/builtin-tool-agent-documents/src/client/Inspector/_styles.ts)                                        |
| `colorTextTertiary`        | No direct ThemeRoles assignment for this engine role; status washes/text and neutral ranks are not interchangeable. | [packages/builtin-tool-agent-builder/src/client/Render/components/PromptDiffView.tsx](../../packages/builtin-tool-agent-builder/src/client/Render/components/PromptDiffView.tsx)             |
| `colorWarningBg`           | No direct ThemeRoles assignment for this engine role; status washes/text and neutral ranks are not interchangeable. | [packages/builtin-tool-orvilo-agent/src/client/Inspector/ClearTodos/index.tsx](../../packages/builtin-tool-orvilo-agent/src/client/Inspector/ClearTodos/index.tsx)                           |
| `colorWarningBgHover`      | No direct ThemeRoles assignment for this engine role; status washes/text and neutral ranks are not interchangeable. | [src/features/DevFeatureFlagPanel/FlagRow.tsx](../../src/features/DevFeatureFlagPanel/FlagRow.tsx)                                                                                           |
| `colorWarningBorder`       | No direct ThemeRoles assignment for this engine role; status washes/text and neutral ranks are not interchangeable. | [packages/builtin-tool-remote-device/src/client/Render/ActivateDevice/index.tsx](../../packages/builtin-tool-remote-device/src/client/Render/ActivateDevice/index.tsx)                       |
| `colorWarningHover`        | No direct ThemeRoles assignment for this engine role; status washes/text and neutral ranks are not interchangeable. | [src/features/PageEditor/DocumentLikes/index.tsx](../../src/features/PageEditor/DocumentLikes/index.tsx)                                                                                     |
| `colorWarningText`         | No direct ThemeRoles assignment for this engine role; status washes/text and neutral ranks are not interchangeable. | [packages/builtin-tool-orvilo-agent/src/client/components/SortableTodoList/TodoItemRow.tsx](../../packages/builtin-tool-orvilo-agent/src/client/components/SortableTodoList/TodoItemRow.tsx) |
| `colorWarningTextActive`   | No direct ThemeRoles assignment for this engine role; status washes/text and neutral ranks are not interchangeable. | [src/features/Acceptance/Run/RunResult.tsx](../../src/features/Acceptance/Run/RunResult.tsx)                                                                                                 |
| `colorWhite`               | No direct ThemeRoles assignment for this engine role; status washes/text and neutral ranks are not interchangeable. | [src/features/PageEditor/DocumentLikes/index.tsx](../../src/features/PageEditor/DocumentLikes/index.tsx)                                                                                     |
| `cyan10`                   | Raw palette token; no semantic-role alias. Do not map a hue by visual similarity.                                   | [src/features/Acceptance/Viewer/Comments/authorColor.ts](../../src/features/Acceptance/Viewer/Comments/authorColor.ts)                                                                       |
| `cyan3`                    | Raw palette token; no semantic-role alias. Do not map a hue by visual similarity.                                   | [src/features/AgentGoals/ProcessControl/shared.tsx](../../src/features/AgentGoals/ProcessControl/shared.tsx)                                                                                 |
| `cyan7`                    | Raw palette token; no semantic-role alias. Do not map a hue by visual similarity.                                   | [src/features/Acceptance/Viewer/Comments/authorColor.ts](../../src/features/Acceptance/Viewer/Comments/authorColor.ts)                                                                       |
| `cyan9`                    | Raw palette token; no semantic-role alias. Do not map a hue by visual similarity.                                   | [src/features/Conversation/Messages/components/Extras/Usage/UsageDetail/index.tsx](../../src/features/Conversation/Messages/components/Extras/Usage/UsageDetail/index.tsx)                   |
| `geekblue`                 | Raw palette token; no semantic-role alias. Do not map a hue by visual similarity.                                   | [src/components/DragUploadZone/index.tsx](../../src/components/DragUploadZone/index.tsx)                                                                                                     |
| `geekblue1`                | Raw palette token; no semantic-role alias. Do not map a hue by visual similarity.                                   | [src/features/Portal/Home/Body/Plugins/ArtifactList/Item/style.ts](../../src/features/Portal/Home/Body/Plugins/ArtifactList/Item/style.ts)                                                   |
| `geekblue10`               | Raw palette token; no semantic-role alias. Do not map a hue by visual similarity.                                   | [src/features/Acceptance/Viewer/Comments/authorColor.ts](../../src/features/Acceptance/Viewer/Comments/authorColor.ts)                                                                       |
| `geekblue3`                | Raw palette token; no semantic-role alias. Do not map a hue by visual similarity.                                   | [src/components/LibIcon/index.tsx](../../src/components/LibIcon/index.tsx)                                                                                                                   |
| `geekblue7`                | Raw palette token; no semantic-role alias. Do not map a hue by visual similarity.                                   | [src/features/Acceptance/Viewer/Comments/authorColor.ts](../../src/features/Acceptance/Viewer/Comments/authorColor.ts)                                                                       |
| `gold`                     | Raw palette token; no semantic-role alias. Do not map a hue by visual similarity.                                   | [src/features/Electron/titlebar/TabBar/styles.ts](../../src/features/Electron/titlebar/TabBar/styles.ts)                                                                                     |
| `gold10`                   | Raw palette token; no semantic-role alias. Do not map a hue by visual similarity.                                   | [src/features/Acceptance/Viewer/Comments/authorColor.ts](../../src/features/Acceptance/Viewer/Comments/authorColor.ts)                                                                       |
| `gold4`                    | Raw palette token; no semantic-role alias. Do not map a hue by visual similarity.                                   | [packages/shared-tool-ui/src/styles.ts](../../packages/shared-tool-ui/src/styles.ts)                                                                                                         |
| `gold7`                    | Raw palette token; no semantic-role alias. Do not map a hue by visual similarity.                                   | [src/features/Acceptance/Viewer/Comments/authorColor.ts](../../src/features/Acceptance/Viewer/Comments/authorColor.ts)                                                                       |
| `green`                    | Raw palette token; no semantic-role alias. Do not map a hue by visual similarity.                                   | [src/features/Acceptance/Viewer/Comments/authorColor.test.ts](../../src/features/Acceptance/Viewer/Comments/authorColor.test.ts)                                                             |
| `green1`                   | Raw palette token; no semantic-role alias. Do not map a hue by visual similarity.                                   | [src/features/Portal/Home/Body/Plugins/ArtifactList/Item/style.ts](../../src/features/Portal/Home/Body/Plugins/ArtifactList/Item/style.ts)                                                   |
| `green10`                  | Raw palette token; no semantic-role alias. Do not map a hue by visual similarity.                                   | [src/features/AgentGoals/ProcessControl/shared.tsx](../../src/features/AgentGoals/ProcessControl/shared.tsx)                                                                                 |
| `green3`                   | Raw palette token; no semantic-role alias. Do not map a hue by visual similarity.                                   | [src/features/AgentGoals/ProcessControl/shared.tsx](../../src/features/AgentGoals/ProcessControl/shared.tsx)                                                                                 |
| `lime10`                   | Raw palette token; no semantic-role alias. Do not map a hue by visual similarity.                                   | [src/features/Acceptance/Viewer/Comments/authorColor.ts](../../src/features/Acceptance/Viewer/Comments/authorColor.ts)                                                                       |
| `lime7`                    | Raw palette token; no semantic-role alias. Do not map a hue by visual similarity.                                   | [src/features/Acceptance/Viewer/Comments/authorColor.ts](../../src/features/Acceptance/Viewer/Comments/authorColor.ts)                                                                       |
| `magenta10`                | Raw palette token; no semantic-role alias. Do not map a hue by visual similarity.                                   | [src/features/Acceptance/Viewer/Comments/authorColor.ts](../../src/features/Acceptance/Viewer/Comments/authorColor.ts)                                                                       |
| `magenta7`                 | Raw palette token; no semantic-role alias. Do not map a hue by visual similarity.                                   | [src/features/Acceptance/Viewer/Comments/authorColor.ts](../../src/features/Acceptance/Viewer/Comments/authorColor.ts)                                                                       |
| `motionEaseInOut`          | No local easing alias; preserve existing curve until owner decision.                                                | [packages/builtin-tool-local-system/src/client/Render/ReadLocalFile/ReadFileView.tsx](../../packages/builtin-tool-local-system/src/client/Render/ReadLocalFile/ReadFileView.tsx)             |
| `motionEaseOut`            | No local easing alias; preserve existing curve until owner decision.                                                | [src/components/CollapsibleContent/index.tsx](../../src/components/CollapsibleContent/index.tsx)                                                                                             |
| `motionEaseOutBack`        | No local easing alias; preserve existing curve until owner decision.                                                | [src/features/PageEditor/DocumentLikes/index.tsx](../../src/features/PageEditor/DocumentLikes/index.tsx)                                                                                     |
| `orange`                   | Raw palette token; no semantic-role alias. Do not map a hue by visual similarity.                                   | [src/components/ExecutionStatus.ts](../../src/components/ExecutionStatus.ts)                                                                                                                 |
| `orange10`                 | Raw palette token; no semantic-role alias. Do not map a hue by visual similarity.                                   | [src/features/Acceptance/Viewer/Comments/authorColor.ts](../../src/features/Acceptance/Viewer/Comments/authorColor.ts)                                                                       |
| `orange3`                  | Raw palette token; no semantic-role alias. Do not map a hue by visual similarity.                                   | [src/features/AgentGoals/ProcessControl/shared.tsx](../../src/features/AgentGoals/ProcessControl/shared.tsx)                                                                                 |
| `orange7`                  | Raw palette token; no semantic-role alias. Do not map a hue by visual similarity.                                   | [src/features/Acceptance/Viewer/Comments/authorColor.ts](../../src/features/Acceptance/Viewer/Comments/authorColor.ts)                                                                       |
| `pink`                     | Raw palette token; no semantic-role alias. Do not map a hue by visual similarity.                                   | [src/features/Conversation/Messages/components/Extras/Usage/UsageDetail/index.tsx](../../src/features/Conversation/Messages/components/Extras/Usage/UsageDetail/index.tsx)                   |
| `purple`                   | Raw palette token; no semantic-role alias. Do not map a hue by visual similarity.                                   | [src/components/DragUploadZone/index.tsx](../../src/components/DragUploadZone/index.tsx)                                                                                                     |
| `purple10`                 | Raw palette token; no semantic-role alias. Do not map a hue by visual similarity.                                   | [src/features/Acceptance/Viewer/Comments/authorColor.ts](../../src/features/Acceptance/Viewer/Comments/authorColor.ts)                                                                       |
| `purple3`                  | Raw palette token; no semantic-role alias. Do not map a hue by visual similarity.                                   | [src/features/AgentGoals/ProcessControl/shared.tsx](../../src/features/AgentGoals/ProcessControl/shared.tsx)                                                                                 |
| `purple7`                  | Raw palette token; no semantic-role alias. Do not map a hue by visual similarity.                                   | [src/features/Acceptance/Viewer/Comments/authorColor.ts](../../src/features/Acceptance/Viewer/Comments/authorColor.ts)                                                                       |
| `volcano`                  | Raw palette token; no semantic-role alias. Do not map a hue by visual similarity.                                   | [src/features/Acceptance/Viewer/Comments/authorColor.test.ts](../../src/features/Acceptance/Viewer/Comments/authorColor.test.ts)                                                             |
| `yellow`                   | Raw palette token; no semantic-role alias. Do not map a hue by visual similarity.                                   | [src/features/Conversation/Messages/components/Extras/Usage/UsageDetail/index.tsx](../../src/features/Conversation/Messages/components/Extras/Usage/UsageDetail/index.tsx)                   |
| `zIndexPopupBase`          | No local popup stacking-role alias; do not guess a z-index utility.                                                 | [src/features/Acceptance/Viewer/Flow/AcceptanceFlow.tsx](../../src/features/Acceptance/Viewer/Flow/AcceptanceFlow.tsx)                                                                       |

## Conversion rules

- `cx(a, b)` → `cn(a, b)` from `cn` only where class composition remains necessary.
  Delete unused imports; do not add cn for a static string.
- Hover/focus-visible/data selectors become `hover:`, `focus-visible:` and
  `data-[x=value]:`. Preserve selector direction, specificity and disabled behavior.
- Move a selector to its owned child if it targets only that child. For arbitrary
  ReactNode descendants retain `[&_h3]:…` / `[&_p]:…`; document these cases. Do not
  change the DOM just to make a utility convenient.
- Preserve inclusive breakpoints. Current default `md:` starts at 768px;
  `max-md:` means below 768px, not **<=768px**. Use the measured arbitrary media
  variant `[@media(width<=768px)]:…` for the OAuth sample, including its equality case.
- A font-size utility also supplies line-height. When the old style only specifies
  font-size, append `leading-[inherit]` or use an explicit font-size-only utility.
  Preserve existing 11px developer metadata; do not silently round it to 12px.
- Logical properties stay logical. `border-block-start-color` is not unconditionally
  `border-top-color`; use the existing semantic variable in an arbitrary property
  when the installed utility inventory lacks the exact logical expression.
- Use existing @theme animations when keyframes match exactly. ContentLoading's
  `to { transform: rotate(360deg) }` duplicates Tailwind's global spin keyframe;
  reuse animate-spin with its original 800ms duration. New distinct keyframes, if
  needed later, belong in global @theme/@keyframes with one name per behavior.
- **Motion review required:** ThemeRoles stops `animate-*` and `transition-*` under
  reduced motion or disabled animations. Legacy hashed classes did not necessarily
  match. The ContentLoading sample now stops in those modes, as DESIGN requires;
  ordinary motion remains 800ms linear/infinite. This is an explicit motion-policy
  correction, not a claim of pixel-identical behavior in every setting. Do not
  copy the sample wholesale until the owner accepts this aspect of phase 0.
- No `!important`, `!` utility modifiers, new dependencies, palette values, design
  tokens, route/store/data changes, or antd/provider removal. A precedence mismatch
  is a finding to investigate, not permission to force utility priority.

## Five samples

| Pattern     | File                                                    | Change / retained contract                                                                                                                      |
| ----------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Flat        | src/features/SharePopover/style.ts                      | p-4, 12px hint with inherited line-height; exported style-object API unchanged.                                                                 |
| Hover       | src/features/Connectors/ConnectorList/ConnectorItem.tsx | Same selected/hover fills, logical layout, 6px input radius and existing click/focus handler. No control replacement.                           |
| Descendants | src/components/GuideModal/index.tsx                     | Preserve h3/p selectors over arbitrary ReactNode descendants; same DOM and modal callbacks.                                                     |
| Media       | src/features/Auth/OAuthConsent/OAuthApplicationLogo.tsx | Same connector dimensions at/below/above768px, subtle separator and icon tone. Same Avatar/ProductLogo.                                         |
| Keyframes   | src/components/Loading/ContentLoading/index.tsx         | Reuse identical global spin keyframe at800ms; preserve 28px indicator/2px stroke/96px minimum region. Motion-policy correction described above. |

These five files remove their direct antd-style imports. No claim is made that
other call sites, GroupForm, theme hosts or transitive @lobehub/ui dependencies
have been migrated. `skeleton: no-change` — no loading shape/DOM replacement.

## Validation and gates

Scoped `bun run check` passed for the five final source paths and this document
(initial batch plus the replacement hover sample). No related tests were selected.
Independent light review caught the shared DevDock cascade issue described below;
the single follow-up verified its removal and found no new findings.
These are presentation-only
samples; source-string rendering tests would not prove CSS equivalence.
Native Electron acceptance completed for these five samples in light/dark.
Actual product components were loaded under the existing native ModalHost: the
ConnectorItem data/callbacks were presentation fixtures; GuideModal tested arbitrary
cover/title h3/p descendants and normal cancel/OK callbacks with close; OAuthApplicationLogo's
third-party connector measured 32/32/40px at native widths 767/768/769. The native
window minimum was temporarily lowered through normal IPC and restored to 1000px.
ContentLoading measured 800ms linear/infinite in normal motion, stopped under
reduced motion and the actual Appearance Off setting, then restored that preference.
SharePopover used a normal-API, self-owned temporary topic, verified 16px padding,
12px hint text with inherited line-height, and Escape close; the topic and sharing
record were removed. These checks cover delivered presentation and callbacks,
not all OAuth/connector service flows or visual parity throughout the application.
The frontend owner accepted this explicit reduced/disabled-motion correction;
it does not authorize phase 1 or a global cascade flip.

As of 2026-10-09, #565 and #573 are merged and the phase-0 samples have native
owner acceptance. ANTD_STYLE_LAYER_ENABLED remains false. Phase 1 is still blocked
until a separately accepted global rollout enables that flag and the pending token
and motion decisions are resolved.
Do not mutate protected Settings/provider or ModelSwitchPanel work. Subsequent
PRs should be one feature directory, at most roughly40files, after checking for
concurrent PRs. The user authorized a stack; this phase0 base is #580 rather than
an unrelated fresh canary branch. Retarget/rebase in order after ancestors merge.

## Sample selection constraint

Do not migrate shared DevDock BarButton in isolation: MemoryWidget still mixes
its class with unlayered text/status/active declarations. Those override layered
hover utilities until the layer prerequisites are active or consumers migrate
together. The initial isolated BarButton candidate was reverted; the hover sample
is ConnectorItem, whose item/active/hover declarations migrate together.
