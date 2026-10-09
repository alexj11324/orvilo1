# Assistant UI chat replacement

User-authorized replacement of the LobeHub chatbot UI with assistant-ui's stock
shadcn-style interface. Source: <https://github.com/assistant-ui/assistant-ui>,
`packages/ui/src/components/react/assistant-ui/elements/thread.aui.tsx`.
Dependencies are pinned to @assistant-ui/react 0.15.25 and react-markdown 0.14.19.

## Surface and ownership

- Replace the main conversation shared by `/chat/new`, `/chat/:topicId`, and agent
  conversation routes in web and Electron. Keep routing, authentication and app navigation.
- New implementation belongs in `src/features/AssistantChat`.
- Use assistant-ui Thread/Message/Composer primitives and Markdown renderer, not
  the old ChatItem, Lexical input, AgentHome or InboxAgentLanding UI.
- Use the upstream centered, max-width conversation, right-aligned rounded user
  bubbles, plain assistant responses, message action bars and rounded composer.
- Follow the application's existing light/dark semantic variables. The user's
  instruction authorizes the upstream chat layout, sizing and typography here.
- Keep business data and authorization in the existing ConversationStore/ChatStore.
  A runtime adapter maps messages and connects actions without replacing the backend.
- Preserve tool approvals, heterogeneous device guards, queued sends, files,
  draft restoration, stop/retry, and subagent read-only behavior.

## Work split

- Primary: message conversion, thread/runtime display, route integration and final checks.
- Composer specialist: new AssistantChatInput using assistant-ui Composer primitives;
  preserve business guards from MainChatInput/HeterogeneousChatInput callers.
- Environment/acceptance specialist: real Electron app and local disposable fixture.

## Evidence boundaries and acceptance

The upstream source establishes default UI structure; runtime visual fidelity is
unverified until Electron captures. Custom Orvilo tool/task payloads require domain
components; upstream examples do not implement these business operations.
Exercise empty/populated/loading/error states, send/stop/retry, draft recovery,
attachments, tool results and approval, topic switching, dark/light and a narrow
window. Record actual outcomes and missing coverage, with the tested commit SHA.
No simulated backend may be presented as an end-to-end agent run.
