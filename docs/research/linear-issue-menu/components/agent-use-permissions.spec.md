# Workspace Issue read and Agent Use

Workspace Issues and their conversations are readable by every active workspace member. Agent Use controls execution independently of Issue read access and independently of Agent management. Personal standalone conversations and other workspaces retain their existing isolation.

The existing resource permission member rows are the selected Agent Use member list. The creator retains implicit Use. A selected active member may Send, Run, Pause, Stop, and Answer; an unselected member may read the Issue/conversation and sees a read-only composer with a disabled Send button. Workspace-wide legacy access levels and management authority do not substitute for selection. Use grants do not grant settings or permission management.

All execution ingress paths check the existing Agent Use guard before side effects. Read ingress paths check workspace Issue readability, without requiring Agent View or Use. Agent identity/configuration needed by an Issue must use safe maintained projections and never expose credentials, environment variables, private instructions, or foreign workspace resources.

Verification: focused denied/granted/removed-member/creator/cross-workspace tests, safe projection tests, operation mutation denial before dispatch, actual member grant and revoke readbacks, and native read-only versus allowed execution outcomes against the frozen source. Historical operation fences and genuine live-executor/NeedsInput state remain unchanged.

Linear reference: <https://linear.app/docs/private-teams> and <https://linear.app/docs/private-issue-sharing> describe team-level visibility and sharing individual private-team Issues; they do not establish an independent per-Issue privacy toggle. Orvilo's explicit product policy above determines this implementation.
