# Official AI Elements Chatbot integration

User selected <https://elements.ai-sdk.dev/examples/chatbot> as the complete page foundation,
plus <https://libraries.dev/orbs>. This supersedes the partial component swaps as the main
chat visual target. Preserve /workspace/orvilo1 (assistant-ui) and /workspace/orvilo-orbs.
Worktree: /workspace/orvilo-ai-chatbot, branch feat/ai-elements-chatbot, based on
3a3a43e2b4dc8d9e29adf375858bb9da09a31668 so real domain component adapters are reused.

## Output mapping

Both reference URLs contribute to existing /chat/new, /chat/:topicId and main agent
conversation routes. They are not new application routes. Conversation owners remain
src/features/Conversation; complete page presentation belongs in src/features/AIChatbot.
Research/evidence belongs only in docs/research/ai-elements-chatbot. Main app navigation
is outside the reference (the example has no sidebar/header). Thread, group, share and
other composer surfaces keep their current presentation. Existing route ids/query/hash
semantics, resource permissions, fetch, persistence, operations and handler ownership stay.

## Approved foundation and split

The actual registry example provides: full-width relative flex column; scrollable
Conversation + ConversationContent; Message / MessageContent (no author/avatar/time row);
a divided, non-overlay footer with gap-4/pt-4, Suggestions then px-4/pb-4 PromptInput.
No extra old toolbar around ToolHeader. Reuse native attachments, reasoning, sources,
tool/confirmation, plan/task, queue, artifact and ReUI code implementations from parent.
No mockResponses, mock model list or fake web-search control in production.

The current verified domain adapters remain; replacing a visual page is not authorization
to replace its runtime. Lexical retains slash Skills, references and IME/draft behavior
inside the official composer body, styled to the measured native textarea. Existing Agent
picker occupies the upstream ModelSelector location, as expressly requested by user.
Orbs replace activity indicators. Runtime theme semantics remain, as do safe media engines.

Root owns context, top-level page/route integration, provenance and assembly.
Composer builder owns the dedicated composer and Conversation/ChatInput adapter, not routes.
Message builder owns ChatItem presentation and ChatList/VirtualizedList geometry/scroll control.
Independent Electron agent owns candidate navigation and full page acceptance after assembly.
All builders work only in the new worktree. No dependency changes or separate shadcn tree.

## Evidence and unknowns

Reference measured at 1440x1000 in isolated Chromium CDP 9265, 2026-10-09, English/light,
public demo populated with upstream content. Exact CSS stored in reference-measurements.json.
Native textarea measured 64px minimum, 12px padding, 14px/20px Geist; footer 16px padding/gap.
Example preview height 600px is documentation framing, not an application height.
Reference dark/narrow/state inspection and final candidate comparison remain pending.
No copied demo messages may be production records. Acceptance uses explicitly synthetic data.
Real Step 5 gateway inference must be reported separately from UI/host-hook validation.

## Reference provenance and extensions

Full Apache-2.0 example source is archived as upstream-chatbot.tsx.txt, with original
URL and SHA256 in source.json. Source notice is retained in ../thinking-orbs/AI-ELEMENTS-LICENSE.
This text archive is research only, not imported application code. Reference screenshots
are public upstream examples, separately labeled reference-\*; no product acceptance claim.
Dark/768/390 states were inspected through CDP and recorded in reference-states.json.
The Orbs public page was inspected separately (orbs-reference.json); the existing actual
thinking-orbs 0.3.2 dependency supplies the animation, not a reconstructed approximation.

No fonts/images are newly copied into the product. Package dependencies unchanged.
The previous optional BorderBeam/BotAvatar embellishments are not copied into this
complete example layout; the latest user selection requests Orbs. Other app surfaces
and the prior worktrees retain their existing effects.
