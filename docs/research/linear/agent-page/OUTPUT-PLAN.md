# Agent page parity output plan

- Reference: `https://linear.app/bdiverifier/agent`
- Populated reference route: an existing `/bdiverifier/agent/:chatSlug` chat opened from the
  page's own history menu. The chat title and content are private evidence and are not copied into
  this repository.
- Candidate: `/ws-useragenttes/agent/inbox`
- Application root: `/Users/alexjiang/Desktop/vibe/orvilo-linear-parity`
- Site key: `linear`
- Page key: `agent-page`
- Research root: `docs/research/linear/agent-page/`
- Intended code owner: the existing Agent conversation feature under
  `src/routes/(main)/agent/features/Conversation/`; route files remain thin.
- Shared foundation: none planned. Reuse Orvilo's existing chat store, topic data, input, theme
  tokens, and brand components.

The bounded delivery is the inbox Agent new-chat surface. It must keep the existing real topic and
message persistence path. Populated-chat rendering, Agent profile/settings, global navigation,
other page parity work, and Linear's global floating quick-chat are outside this slice unless the
candidate inspection proves that an Agent-owned boundary cannot be corrected without them.
