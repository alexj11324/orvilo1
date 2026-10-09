# Official Chatbot composer — approved builder scope

Source: <https://elements.ai-sdk.dev/examples/chatbot>, registry example-chatbot.
Measured 1440x1000 light public example through CDP 9265 on 2026-10-09.
Source JSX: footer `grid shrink-0 gap-4 pt-4`; Suggestions px-4 then composer
wrapper `w-full px-4 pb-4`. PromptInput Header(Attachments)/Body/Footer.
Tools LEFT: plus, voice, search, model selector. Submit alone RIGHT.
Native body 64px minimum, max-h-48, padding12px, font14px/20px. Form full width.
No old floating bottom device row, right Agent chip, resizing grip or separate
outer card / toolbar. Default PromptInput group styling; semantic theme adapts
palette (no hardcoded upstream colors). Dropdowns clickable/keyboard interactions.

Create dedicated src/features/AIChatbot/Composer.tsx using those native parts.
Reuse current Lexical InputEditor only as the editor engine in PromptInputBody
so slash Skills, context references, attachment upload, IME, drafts and send guards
remain real. Style body to measured textarea layout. This deliberate engine
exception is not permission to keep DesktopChatInput's old surrounding layout.
Existing Agent selector goes in LEFT tools at the model-selector location (user
explicitly said keep it). No mock model selector or fake web search. Use real
existing plus/voice actions. Keep device/workdir/access/context/expand controls
accessible via details popover/menu, not a persistent old strip below the card.
Use native SendButton PromptInputSubmit adapter for permissions/Stop. Existing
ContextContainer already native Attachments and receives upload state.
Retain ComposerBeam if straightforward, radius must match actual native group.
Orbs activity supplied by page/message paths; do not restore operation ticker or
four-square tool icon. Parameter edit/approval/queue/goal capabilities retained.

Wire dedicated renderer only for useChatbotSurface() true in
src/features/Conversation/ChatInput/index.tsx. Keep provider/send/draft hooks intact.
Remove WideScreenContainer cap and negative margin for this surface; inline queue,
todo/goal rows in normal layout flow instead of overlay above composer. Footer
padding is owned by new page root (root agent); your adapter should not add another
16px horizontal gutter. Other conversation/editor surfaces unchanged.
Own: Composer.tsx, Conversation/ChatInput/index.tsx, plus minimal dedicated helper
files under AIChatbot (not context/page). Do not edit shared Desktop renderer or
locales without coordinating. Existing locale labels suffice. Add meaningful
existing-test coverage for changed behavior, no new component test files. Scoped
checks with bun. No commits; root integrates and independently verifies Electron.
