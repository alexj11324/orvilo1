# Candidate Agent diagnosis

## Root cause, trigger, symptom

- Trigger: open the workspace-mirrored inbox Agent route
  `/ws-useragenttes/agent/inbox` after the built-in inbox slug resolves to its persisted Agent ID.
- Earliest incorrect boundary: `AgentIdSync` derived the child-route suffix with
  `location.pathname.replace('/agent/inbox', '')`. The workspace-prefixed pathname left
  `/ws-useragenttes` behind.
- Resulting route: the workspace-aware redirect produced
  `/ws-useragenttes/agent/<resolved-inbox-id>/ws-useragenttes`, treating the workspace slug as a
  fake topic ID.
- Visible symptom: the candidate stayed on the generic Agent welcome composition while its URL and
  conversation identity disagreed. Existing sweep evidence also showed the generic welcome's empty
  spacer pushing the identity card and composer to the bottom of the page.

## Bounded correction

1. Derive the child suffix from the actual `/agent/:aid` boundary so a workspace prefix is never
   retained as topic state. Real child paths such as `/profile` and `/:topicId` remain preserved.
2. Once the corrected inbox route has no topic, render a centered inbox landing around the existing
   real `MainChatInput`. Existing topics, non-inbox Agents, and populated conversations continue
   through the existing `ChatList` and message store.

## Verification contract

- Regression proof: the workspace redirect test must fail with the former URL
  `/agent/<resolved-id>/ws-useragenttes` and pass with `/agent/<resolved-id>`.
- Live Electron: the final workspace URL contains no synthetic topic segment; selecting a real
  persisted topic still navigates to exactly that topic and renders its messages; returning to new
  chat restores the centered landing.
