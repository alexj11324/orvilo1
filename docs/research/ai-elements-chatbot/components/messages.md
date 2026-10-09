# Official Chatbot message/list — approved builder scope

Source <https://elements.ai-sdk.dev/examples/chatbot> and full registry example-chatbot.
Source directly maps MessageBranch/MessageBranchContent/Message(from)/MessageContent.
No avatar/author/time header before messages. User native bg-secondary bubble,
assistant plain content; sources then reasoning then response; branches below actual
branch-bearing records. Do not invent demo branches. Reference p-4 list inset,
gap-8 rows; full available page width, no 700/768px inner cap. Composer uses same16px
outer inset. No old loading/check title, fixed24px identity-row gap or old toolbar.

New main page is scoped by useChatbotSurface() from features/AIChatbot/context.tsx.
Create dedicated Message layout as needed and route existing ChatItem through it,
or adapt shared native Message composition within this explicit context. No CSS
hiding of mounted old author rows. Keep domain message handlers/permissions/error,
selection/edits/realbranch navigation; persistent multiagent/sender distinctions
must remain accessible (e.g. semantic labels/important headerAddon). Native header
metadata not represented in reference is an explicit business exception, not
permission to carry full old rows. Existing Tool/Confirmation/Plan/Task/ReUI/Artifact
already migrated; reuse them. Orbs render pending activity and reasoning state.
Retain custom/user identity information for accessibility even if no visible row.

ChatList/VirtualizedList must preserve fetch/persisted scroll, long history,
steered row folding, deep-link resolver and Review scrollToMessage. Native
Conversation scroll button appearance should replace old BackBottom only for this
surface. Extend ConversationScrollButton with explicit controlled external scroll
adapter if needed, separating hook-owning internal component (no conditionalhook).
Preserve label i18n. No second scroll engine around virtua. Footer/root composition
belongs root agent. Context is already created. Do not change route or composer.
Own ChatItem and ChatList files, new AIChatbot/Message\*.tsx, conversation primitive
if necessary. No new deps. Use existing meaningful tests; no new component tests.
No commits. Report intended business exceptions and scope checks honestly.
