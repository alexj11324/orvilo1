# Agent brands and Issue property status

Targets: AgentTasks shared metadata/AssigneeAvatar, IssueStatusPicker/TaskProperties and actual Agent-actor Avatar consumers.
Evidence: user activity and task screenshots show JA/JV avatar initials. All Agent display must use runtime brand; editable Agent names/avatars cannot select its brand. Humans retain avatars/initial fallback, groups retain group identity.
Reuse components/AgentRuntimeIcon and existing runtime identity resolver/provider catalog. Fix shared useAgentDisplayMeta to carry canonical runtime type from config/home list, so all AssigneeAvatar consumers inherit fix. Known inaccessible Agent must not become Orvilo by default; use the established unknown-runtime glyph.
Inspect all other genuine Agent-avatar paths (message authors, Portal AgentDetail/thread, Approval, HomeInbox/topic, Electron agent-specific tabs). Do not replace user/project/group avatars.
Issue status selects workflowCategory/ref and uses same board icon/command. Existing IssueStatusPicker is canonical. Fix trigger and menu rows that lack non-done icons; inspect callers before edit. Don't apply executionStatus icons to business state. in_review must remain selectable under current permission/CAS invariants.
Brand icon compact existing14/16/18 dimensions, no letter badge. Accessible label identifies Agent; don't use title-only hidden text to fake identity.
Existing tests plus meaningful regression on runtime/name distinction and workflow category selection; no stylesheet mirror or new component test suites. Scoped checks, no tsgo. Coordinate group uses same icon component but agent owns GroupProfile paths.
