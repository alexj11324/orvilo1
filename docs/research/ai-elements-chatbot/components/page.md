# Complete Chatbot page composition

Source example-chatbot provides a full-width relative flex column with divided
Conversation and non-overlay footer, p4 content inset and gap8 message spacing.
The native example contains no application navigation or empty-data variant.

Main Orvilo agent conversations use this composition for empty and populated states.
Existing ChatList supplies real persisted data, authorization-aware actions, refresh
errors and virtualization. It renders the actual Conversation/ConversationContent
with an external scroll owner to avoid nested engines. The existing route provider
retains all gateway, topic migration, subagent read-only and analytics hooks.

Footer is grid/shrink0/gap4/pt4 with Suggestions and px4/pb4 Composer. Suggestions
are actual configured agent questions for empty chat or generated follow-up chips
for the latest assistant reply. Fallback starter prompts use existing localized
product examples. No unrelated upstream demo messages/models/stream simulator.

Empty page uses the library's native ConversationEmptyState with localized text and
requested Libraries.dev ThinkingOrb 64px breathing/connecting. This is an explicit
product extension because no empty state is demonstrated by example-chatbot.
Busy reasoning retains 20px solving Orbs from the prior real component adapter.
Application theme, Agent selector, Lexical document engine, ReUI code rendering,
permissions and tool-specific edits are deliberate domain integrations.

The existing application header remains in flow above the page. Its old wide-screen
floating query is not applied to this layout. Duplicate floating bottom history and
minimap chrome no longer mount here; header history and sidebar navigation remain.
Other chat mounts retain their existing presentation through a default-false context.
