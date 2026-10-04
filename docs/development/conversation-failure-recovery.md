# Conversation failure recovery

A refused dispatch may already have persisted the user and assistant error messages. The client synchronizes those messages, marks the parent operation and owning topic failed, and does not start an execution stream or write a running state.

Cancellation only clears the matching topic after cancellation is confirmed. An unknown cancellation remains blocked, and a late result cannot overwrite a newer operation's topic state. Workspace conversation-feed identity is used when clearing sidebar running markers.

Before message acceptance, a failed preparation restores the complete editor JSON, files and Context selections. New text and another conversation are protected from restoration; the original input remains in input history.

Scoped regressions cover refused dispatch, workspace cancellation markers, unknown cancellation, draft/attachment restoration and concurrent input changes. Real Electron and remote CI evidence is recorded on the integrating PR with its revision; this commit is a source checkpoint until that acceptance completes.
