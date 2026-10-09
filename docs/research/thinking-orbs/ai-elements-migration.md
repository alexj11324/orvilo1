# AI Elements chat migration

User confirmed on 2026-10-09: AI Elements first; ReUI when a better fit. Replace
matching chat presentation components throughout the conversation surface, not
just code blocks. ReUI Code Block remains the chosen code renderer. The old
assistant-ui worktree is preserved; all work stays in /workspace/orvilo-orbs,
feat/orbs-chat, Draft PR 574.

## Source and foundation

Official registry inspected using pnpm dlx shadcn\@latest view; unmodified source
SHA256 recorded in ai-elements-registry.json. Source snapshot is in /tmp/ai-elements-
initial.json and /tmp/ai-elements-registry.json. Docs at
<https://elements.ai-sdk.dev/components/{name}>. Actual source is copied into
src/components/ai-elements, not approximated markup. The repository uses
base-nova / Base UI, so adapt Radix asChild/data-state conventions to existing
Base UI render/nativeButton/data-open attributes. Keep semantic theme tokens,
local UI primitives and local ReUI Code Block imports. Root owns dependencies,
missing shared primitives, shared shimmer and theme foundation.

## Scope and ownership

- Message specialist: message.tsx, conversation.tsx, sources.tsx,
  inline-citation.tsx, suggestion.tsx; Conversation/ChatItem, ChatList,
  Messages/components/MessageActionBar, SearchGrounding, FollowUpChips. Use actual
  Message/MessageContent/MessageActions/MessageAction and source/suggestion pieces.
  Retain virtualized list and one scroll owner; use conversation presentation
  where compatible, never nest independent autoscroll engines. Retain permissions,
  edit/copy/retry actions, custom Markdown plugins and group message identity.
- Composer specialist: prompt-input.tsx, context.tsx, queue.tsx; ChatInput/Desktop,
  InputEditor bridge, SendArea, TokenTag, Conversation/ChatInput/QueueTray. Replace
  LobeHub visual input card with PromptInput/Body/Header/Footer/Tools/Submit.
  Lexical editor can be slotted as the input engine: preserve its native document,
  slash Skills, mentions, local-file tags, drafts, IME, queues, scheduling,
  attachment dispatch, device guards and stop. Do not keep the LobeHub visual
  card inside a cosmetic wrapper. Retain Beam integration. No restored Blocks
  tool button or OpStatusTray above composer. Owner may edit PromptInput source
  to bridge existing editor actions rather than duplicate state.
- Tool specialist: reasoning.tsx, tool.tsx, confirmation.tsx;
  Conversation/components/Thinking, Messages/AssistantGroup/Tool and
  InterventionBar. Actual Reasoning/Tool/Confirmation shells with real state
  adapters. Keep Orbs where appropriate, response durations, code/detail views,
  specialized tool renderers, approval ownership, argument edit/reject/approve,
  keyboard and retry/error paths. Confirmation presentation is not authorization.
- Planning specialist: plan.tsx, task.tsx; Conversation/TodoProgress,
  ChatInput/VerifyTray/GoalTray, Messages/Tasks and GroupTasks. Replace matching
  shells with actual Plan/Task pieces and preserve all persisted task state,
  edit actions, links, client/server task differences, lab gating.
- Root: Markdown/ReUI CodeBlock integration, attachments.tsx and file/context
  attachment display integration, shared primitives/dependencies, assembly.
- Independent Electron specialist: runtime navigation and acceptance only;
  source builders cannot approve their own final captures.

## Behavior and visual contract

Use upstream component structure/style with application semantic tokens. Keep
user-selected Orbs/Beam/Bot accents. Preserve existing app route, sidebar,
business identities, auth, backend and tool execution. No fake model responses,
no sample controls that do not work. User requested direct upstream visual, so
old chat card chrome need not be retained, but existing outcomes must work.

Do not reset a draft on busy state or topic switch; persist it. Message custom
plugins, citations, HTML sandbox previews, Mermaid, structured tool renderers,
permissions and virtualization remain real mechanisms. Domain-backed devices and
working directory controls have no equivalent AI Elements engine and stay on
local shadcn controls. Explicitly inventory any unmatched specialized surface.

## Checks and independent acceptance

Scoped lint/tests only; full root type-check and full tests are prohibited by
repo rules. No new component .test.tsx files; meaningful logic/hooks tests and
existing tests may be used. Read AGENTS and applicable skills. Product evidence
in this directory with source SHA. Electron inventory: Markdown/code (multiline,
unknown language, empty/unfinished fence, copy/wrap/expand/download), streaming,
reasoning, tool pending/success/error, approvals, task states, source/citation,
attachments, suggestions, prompt input/slash/IME/queue/stop/error draft recovery,
scroll/history, light/dark/narrow, and prior removals preserved. Use disclosed
local synthetic fixtures where real gateway access is unavailable; never claim
those prove real Step 5 end-to-end inference.

## Terminal and command snippet extension

Tool specialist also owns official registry Terminal/Snippet adapters plus
shared-tool-ui RunCommand and cloud-sandbox ExecuteCode presentation. Source
registry snapshot: /tmp/ai-elements-extra.json. Real command strings use Snippet
with copy; multiline commands/code keep ReUI syntax blocks. Completed stdout
and stderr use Terminal's header/copy/content shell with the existing ANSI
renderer slotted for RunCommand. No interactive xterm or tool execution changes.
Keep 200px output scroll bounds, complete text for copy, separate stderr, and
existing argument sanitization; no fake streaming/exit code labels or clear
button that would mutate stored results. Upstream terminal dark palette is
adapted to application semantic theme tokens. Runtime acceptance must include
ANSI output, long scrollable output, copy and light/dark colors.

### Expanded message specialist ownership

The message slice also owns the upstream `chain-of-thought` component and its
adapters in `AssistantGroup/components/Group.tsx` and `ProcessFold.tsx`. Process
steps retain their specialized tool/reasoning descendants, stable group context,
streaming flags, continuation boundaries and final-answer placement. The finished
process toggle adopts ChainOfThought header/content; existing lab gating and
recorded duration/step count remain authoritative. Base UI uses one shared
Collapsible root so the header controls the actual process panel.
