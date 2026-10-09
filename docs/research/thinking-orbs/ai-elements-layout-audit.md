# Direct upstream layout audit

The initial migration imported upstream components but retained several old layouts
inside them. It did not satisfy the user's request to adopt the upstream appearance.
This audit records the corrective pass, including the complete official Tool and
Confirmation examples supplied by the user. It is not a claim that every LobeHub
engine or every application screen has been removed.

## Complete official examples inspected

Fetched with `pnpm dlx shadcn@latest view` on 2026-10-09. Registry URLs and original
source hashes are in [ai-elements-examples.json](ai-elements-examples.json).

| Ready-made composition                                                                  | Actual integration                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `example-tool`: Tool / ToolHeader / ToolContent / ToolInput / Confirmation / ToolOutput | Both grouped and standalone tool message paths; binary approval is inside its tool card, with parameter JSON preceding it. Generic results use ToolOutput; command-specific output uses the official Terminal/Snippet components.                       |
| `example-confirmation`: Title / Request / Actions / Reject and Approve                  | Default binary card is a concise summary and two direct actions. Existing parameter edits, rejection reason, Stop and explicit remembered permission are in a collapsed details section. The actual authorization and execution handlers are preserved. |
| `example-plan`: Header / Title / Description / Trigger / Content / Footer / Action      | Todo and persisted goal/check surfaces use these parts. No simulated build action or invented plan data.                                                                                                                                                |
| `example-task`: Trigger / Content / TaskItem                                            | Client/server tasks, group tasks and intermediate messages use native task presentation with real state.                                                                                                                                                |
| `example-attachments-inline`: Attachments / Preview / Info / Remove / HoverCard         | Upload, code/text selection and browser-element chips; existing upload state, retry and preview handlers remain wired.                                                                                                                                  |
| `example-artifact`: Header / Title / Description / Actions / Content                    | Artifact has a source preview using ReUI Code Block and a real open-in-side-panel action. The example's nonfunctional Run/Share/Regenerate callbacks are not copied.                                                                                    |

## Legacy layout findings and replacements

| Surface                  | Retained layout found                                                                                             | Correction                                                                                                                                                                                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tool header              | Legacy Inspectors passed as ToolHeader children, replacing the entire default header                              | Default upstream name, status badge and chevron; tool details live in content.                                                                                                                                                                                          |
| Standalone tool          | Separate old Accordion/Inspector path had been missed                                                             | Same Tool components and pending approval detail as grouped messages.                                                                                                                                                                                                   |
| Approval                 | Bottom intervention card, numbered options and separate Submit; later a crowded always-visible action form        | Official inline ToolInput plus compact Confirmation. Binary requests no longer replace the composer. A small review link locates a pending virtual row; same-turn bulk actions remain in its menu. Custom provider/question forms keep their existing domain form host. |
| Reasoning                | Old purple boxed icon, title and shiny-text override                                                              | Default ReasoningTrigger wording/layout and content; real duration and user-selected streaming Orbs remain.                                                                                                                                                             |
| Process timeline         | Old Accordion, boxed status icon, animated headline and padded flex stack nested inside ChainOfThought            | ChainOfThought header/content/step presentation; real expand state, approval force-open, duration and final-answer placement remain.                                                                                                                                    |
| Messages                 | Extra legacy body wrapper, forced assistant width/recolor and duplicate spacing                                   | Message/MessageContent and Conversation spacing; the virtual list remains the only scrolling engine.                                                                                                                                                                    |
| Sources                  | Custom old trigger and content spacing overrides                                                                  | Sources default trigger/content and InlineCitation composition.                                                                                                                                                                                                         |
| Goal/check/task          | Tiny uppercase section labels, zero-padding content, boxed task icons and nested instruction cards                | Plan descriptions/actions/footer and Task/TaskItem presentation.                                                                                                                                                                                                        |
| Composer                 | Nested old toolbar sizing wrappers; shared InputGroup treated disabled Send as a disabled whole composer          | PromptInputTools owns toolbar spacing. Semantic card fill/border remain stable for empty and typed drafts; no whole-editor disabled wash.                                                                                                                               |
| Context usage            | Old TOKEN badge and colored progress sections nested inside the new Context popup                                 | Upstream usage-row presentation, using real estimates and existing labels.                                                                                                                                                                                              |
| Attachments              | Forced 28px old chip, old thumbnail component, eight-character selection truncation and horizontal-scroll wrapper | Native inline attachment height/wrapping, Preview/Info/HoverCard, CSS truncation of complete labels. Upload/progress/retry and full preview remain functional.                                                                                                          |
| Artifact                 | Old large icon/link card inside ArtifactHeader; missing actual ArtifactContent                                    | Official header/actions/content composition with real source and preview behavior.                                                                                                                                                                                      |
| Command output           | Legacy wrapper indentation and over-strong inherited input border                                                 | Direct Snippet and Terminal presentation with semantic surfaces and real copy actions.                                                                                                                                                                                  |
| Follow-ups/actions/queue | Inspected; already use actual Suggestion, MessageAction and Queue parts                                           | Keep existing upstream composition and real handlers; no additional custom shell added.                                                                                                                                                                                 |

The legacy tool-header action rail has also been removed from both grouped and standalone tool messages. Debug, delete, renderer-toggle and plugin-settings buttons no longer sit beside ToolHeader. Their unused Actions/Debug components and local state were removed; ToolHeader is now a direct child of Tool, with only its native collapse control. Specialized result renderers remain the default.

## Deliberate domain integrations

These are retained capabilities, not substitutes for available upstream layouts:

- Existing Agent selector, explicitly retained by the user; no duplicate model selector.
- Lexical document/draft/slash/IME engine inside PromptInput; existing device and working-directory controls.
- Virtualization, persisted topics/messages, permissions, tool runtime and approval ownership.
- Markdown parsing/custom plugins, safe HTML/Mermaid preview and full media lightboxes.
  ReUI owns code blocks; adopting a visual component does not by itself replace these engines.
- Tool-specific editable forms, warnings, custom questions and provider interactions. Binary
  approval uses Confirmation; a question skip or stopped turn is not mislabeled as a rejection.
- User-selected Bot avatar, Orbs and Beam accents.
- Application tabs/sidebar/navigation, outside the chatbot component replacement.

The four-square Skills shortcut and composer operation ticker remain removed.

## Verification

Final Electron screenshots and revision-specific results are recorded in the acceptance
report under `evidence/`. Synthetic fixtures and host vetoes exercise presentation and
callback wiring without executing commands. They do not prove real gateway/model execution.
Previous `refined-*` captures represent an intermediate design rejected by the user and
must not be presented as the final official-example implementation.
