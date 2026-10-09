# Chat component replacement audit

Inspected 2026-10-09 in `feat/orbs-chat`, based on `6ffa` and its current working
changes. Scope: Conversation, ChatInput, and main agent conversation owners.
This is a source-backed inventory, not a claim that a new chat template or AI
Elements integration has shipped. The requested ReUI code block remains the
chosen code presentation; AI Elements does not need to replace it.

## Changes in this task

- ReUI code-block integration in chat body Markdown is the primary implementation
  workstream. Its coverage and verification belong to that change's report.
- `src/features/Conversation/Error/ChatInvalidApiKey.tsx`: replaces the remaining
  LobeHub base Button with `@/components/ui/button`, `type="button"` and
  `variant="default"`. The existing provider-settings navigation and message
  deletion callback are unchanged. This button had no disabled/loading props.
- No AI Elements package or components are installed by this audit. The candidates
  below are proposals, not implementation promises.

## Already local: avoid replacing these a second time

| Visible surface                                     | Current owner / evidence                                                                                                                                                                                                                                                                   |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Approval / stop buttons                             | `Conversation/Messages/AssistantGroup/Tool/Detail/Intervention/ApprovalActions.tsx` imports local `ui/button`; `InterventionBar/InterventionTabBar.tsx` imports local Button and Tooltip.                                                                                                  |
| Tool expansion, separators, loading skeletons       | `Conversation/Messages/AssistantGroup/Tool/index.tsx` imports local Accordion, Separator, Skeleton. Domain rendering still resolves builtin tool renderers and streaming renderers.                                                                                                        |
| Agent/device/directory selectors                    | `ChatInput/ActionBar/Agent/index.tsx`, `ControlBar/HeteroDeviceSwitcher.tsx`, `ControlBar/WorkingDirectoryPicker.tsx` use local Button, Input and Popover.                                                                                                                                 |
| Approval mode and branch menus                      | `ChatInput/ControlBar/ApprovalMode.tsx`, `BranchSwitcher.tsx`, `HeteroControlBar/PermissionSelector.tsx` use local dropdown-menu and Button.                                                                                                                                               |
| Message forwarding dialogs                          | `Conversation/MessageForward/{ForwardModal.tsx,TopicForwardModal/Content.tsx}` use local Button, Input, Textarea and the local modal system.                                                                                                                                               |
| Message avatars                                     | `Conversation/ChatItem/components/Avatar.tsx` wraps local `components/Avatar`; only default assistant identity opts into BotAvatar. This is not the global LobeHub Avatar.                                                                                                                 |
| Tool arguments, debug, errors, edited-file snippets | `Conversation/Messages/AssistantGroup/Tool/Detail/Arguments/index.tsx`, `Tool/Debug/index.tsx`, `Messages/EditedFilesCard/index.tsx`, `Messages/Tasks/shared/ErrorState.tsx` already use `components/ui/code-block`. That local component consumes the ReUI code-block highlighting layer. |
| Badges and link popovers                            | `Conversation/Messages/components/SearchGrounding.tsx` uses ReUI Badge; `Conversation/Markdown/plugins/Link/Render/InternalEntityPreview.tsx` uses local Popover and Avatar.                                                                                                               |

Paths in the table are relative to `src/features/` unless explicitly stated.
Local compatibility adapters such as ActionIcon, Modal, Avatar and toast are
legitimate local owners; a LobeHub-compatible prop shape alone is not proof of a
remaining upstream control.

## Remaining ReUI/shadcn candidates

| Priority                                 | Surface / current dependency                                                                                                                          | Local replacement and required preservation                                                                                                                                                                                                                 |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Small, implemented                       | Invalid-provider-key action: `Conversation/Error/ChatInvalidApiKey.tsx` used LobeHub base Button.                                                     | Local Button; the callback remains identical.                                                                                                                                                                                                               |
| High visual impact, separate scoped task | Message action strip: `Conversation/Messages/components/MessageActionBar/index.tsx` imports LobeHub `ActionIconGroup` and renders it in two branches. | Local icon Buttons + Tooltip + DropdownMenu. Keep `useBuildActions`, permission-filtered viewer actions, promoted comments, disabled filtering, nested submenu dispatch, dividers and optional leading controls. There is no local drop-in ActionIconGroup. |
| Small presentation, moderate behavior    | Context-window indicator: `ChatInput/ActionBar/Token/TokenTag.tsx` imports LobeHub `TokenTag`.                                                        | Local Button/Badge + Progress and existing ActionPopover/TokenDetails. Preserve used/max/overload semantics, localization and the current hide-below-50%-unless-dev rule. Not just an import replacement.                                                   |
| Moderate                                 | Search-source cards: `Conversation/Messages/components/SearchGrounding.tsx` imports LobeHub `SearchResultCards`.                                      | Local Card/Collapsible/links, or AI Elements Sources below. Preserve original citation href separately from favicon domain, query labels, image search results and malformed-URL handling.                                                                  |
| Moderate                                 | Approval container: `Conversation/InterventionBar/index.tsx` uses editor `ChatInput` only as a card wrapper.                                          | Local Card/scroll layout with existing InterventionContent and TabBar. Preserve footer action portal, max-height scroll owner, sticky content, pending-hotkey scope and batch approval boundaries. The wrapper is simpler than migrating the real editor.   |
| Higher risk                              | Send/stop control: `ChatInput/SendArea/SendButton.tsx` imports editor SendButton.                                                                     | Local Button + DropdownMenu can render it, but must retain create-content/resource permissions, disabled state, send-versus-stop behavior, send menu, queue dispatch and explanatory tooltip.                                                               |

Only the Button change is implemented here. Suggested next priorities are the
message action strip and the approval **container**, each as a bounded change.

## Vercel AI Elements: mapping to actual Orvilo owners

AI Elements supplies specialized presentation components built around familiar
React/shadcn patterns. Existing ConversationStore, ChatStore, file store, runtime
and authorization remain the business owners. An SDK-shaped prop or status is an
adapter boundary, not evidence that our backend must be replaced by AI SDK.

| Official component                                                                                                                    | Actual current owner                                                                                                                                                    | Fit and required adapter                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Reasoning](https://elements.ai-sdk.dev/components/reasoning)                                                                         | `Conversation/Messages/components/Reasoning.tsx` → `Conversation/components/Thinking/index.tsx`; Markdown Thinking/OrviloThinking plugins also enter this presentation. | Strong candidate for the expandable reasoning shell. Feed existing `isMessageInReasoning`, content and duration; preserve signature-only suppression, multimodal reasoning, user collapse state and streaming/error behavior.                                                                  |
| [Tool](https://elements.ai-sdk.dev/components/tool)                                                                                   | `Conversation/Messages/AssistantGroup/Tool/index.tsx`, `Tool/Inspector`, `Tool/Detail`.                                                                                 | Strong candidate for tool header, status and input/output shell. Map Orvilo tool state to component states; keep builtin custom renderer selection, streaming output, intervention, retry/error and debug actions. Do not flatten every specialized tool result into generic JSON.             |
| [Confirmation](https://elements.ai-sdk.dev/components/confirmation)                                                                   | `Conversation/InterventionBar/index.tsx`; `AssistantGroup/Tool/Detail/Intervention/{index.tsx,ApprovalActions.tsx}`.                                                    | Suitable for approve/reject presentation. Approval itself remains existing callbacks, authorization, argument editing and batch scoping. Preserve keyboard registration and tool-message identity; this component does not grant permission or execute the tool.                               |
| [Plan](https://elements.ai-sdk.dev/components/plan) / [Task](https://elements.ai-sdk.dev/components/task)                             | `Conversation/TodoProgress/index.tsx`, `ChatInput/VerifyTray/GoalTray.tsx`, `Messages/Tasks/TaskItem`, `Messages/GroupTasks/TaskItem`.                                  | Good shells for expandable plans and task steps. Adapt persisted todos/goals and real run statuses; preserve lab gating, edits, subagent navigation and client/server task distinctions. No new planner or task engine is included.                                                            |
| [Attachments](https://elements.ai-sdk.dev/components/attachments)                                                                     | `ChatInput/Desktop/ContextContainer`, `Conversation/Messages/User/components/{FileListViewer,ImageFileListViewer,AudioFileListViewer,VideoFileListViewer}`.             | Good for compact file chips and removal affordances. Keep upload validation/progress/retry, file ownership, existing file viewers/lightboxes, and distinguish context selections from uploaded files.                                                                                          |
| [Sources](https://elements.ai-sdk.dev/components/sources) / [Inline Citation](https://elements.ai-sdk.dev/components/inline-citation) | `Conversation/Messages/components/SearchGrounding.tsx`; message Markdown props and `Markdown/plugins/Link`.                                                             | Good sources disclosure/citation presentation. Adapt citation IDs and URLs. Current Link parser deliberately excludes `citation-1` links, footnotes and anchors; preserve that distinction and do not rewrite GitHub/Linear/internal entity previews as citations.                             |
| [Suggestion](https://elements.ai-sdk.dev/components/suggestion)                                                                       | `Conversation/FollowUp/FollowUpChips.tsx`, `hooks/useChatFollowUp.ts`, follow-up action store.                                                                          | One of the smallest UI candidates. Retain actual generated suggestions, visibility/dismissal state and their existing submit/consume callback. Example suggestions in docs are not backend-generated functionality.                                                                            |
| [Message](https://elements.ai-sdk.dev/components/message) / [Conversation](https://elements.ai-sdk.dev/components/conversation)       | `Conversation/ChatItem`, `Conversation/ChatList/index.tsx`, `ChatList/components/VirtualizedList.tsx`, `Messages/AssistantGroup`.                                       | Message shells/actions are plausible; replacing the whole list is a larger project. Preserve virtualization, deep links, author identity, grouped workflows/continuations, selection, history/loading/error states and scroll behavior. Existing Markdown/custom message renderers can remain. |
| [Prompt Input](https://elements.ai-sdk.dev/components/prompt-input)                                                                   | `ChatInput/Desktop/index.tsx`, `ChatInput/InputEditor/index.tsx`, `Conversation/ChatInput/index.tsx`, MainChatInput/HeterogeneousChatInput route owners.                | A larger editor migration, not a skin swap. Lexical document/mention/action/local-file tags, drafts, queued sends, scheduling, voice/dictation, permissions, device guards and Editor bridge all need explicit adapters. Basic textarea examples do not implement these capabilities.          |

Recommended exploration order: Suggestion and Sources for small independent
surfaces; Reasoning and Tool for the largest agent-specific visual improvements;
then Confirmation/Plan with business-state tests. Message-list and PromptInput
replacement should be separate migration scopes. ReUI Code Block can remain
inside any of these choices.

## Components not suitable for a blind replacement

- `Conversation/Markdown/index.tsx` and multiple direct Markdown consumers still
  use LobeHub Markdown. The pipeline contains custom mention/link/thinking
  plugins, citations, artifact/HTML previews, rich multimodal content and streaming.
  Changing fenced-code rendering is much smaller than replacing this engine.
- `ChatInput/InputEditor` and user `RichTextMessage.tsx` depend on editor/renderer
  document formats and custom nodes. shadcn Textarea is not an equivalent engine.
- LobeHub Image/PreviewGroup callsites preserve image lightbox behavior; local
  Card or img alone would remove zoom/navigation. PatchDiff in
  `Conversation/WorkingSidebar/Review/FileItem.tsx` likewise needs real diff parity.
- MaskShadow, Freeze, GroupAvatar and the draggable Portal panel are specialized
  retained features, not unconverted generic Buttons. SVG/icon imports and
  type-only imports do not constitute a visible control migration.

## Verification boundary

The audit is static source inspection. The Button swap receives scoped lint; it
changes a reversible visual primitive, not business logic. Code-block verification
is recorded separately by its implementation owner. No AI Elements runtime,
visual parity, backend compatibility or deployment is claimed by this document.
