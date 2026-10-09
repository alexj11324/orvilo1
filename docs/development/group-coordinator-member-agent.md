# Group coordinator is a member Agent

A Group references existing Agents. It never creates one.

- **Creation** (`group.createGroup`, `group.createGroupWithMembers`, the Group Agent Builder `createGroup` tool) takes existing member Agent IDs and a `coordinatorAgentId` that must be one of them. `AgentGroupRepository.createGroupWithSupervisor` validates member access, scope and the coordinator runtime in one transaction and writes only `chat_groups` and `chat_groups_agents` rows.
- **Coordinator** is the member whose `chat_groups_agents.role` is `supervisor`. `ChatGroupModel.updateAgentInGroup` moves the role atomically, so a Group has at most one coordinator and the Agent ID never changes. A runtime that cannot run the Group supervisor tool surface is rejected with `ORCHESTRATOR_RUNTIME_UNSUPPORTED`.
- **Reads** (`getGroupDetail` / `findByIdWithAgents`) never provision a supervisor. A missing or inaccessible coordinator leaves `supervisorAgentId` unset until someone picks a member. Members the viewer cannot see are omitted, coordinator included.
- **Ownership** is independent from the role. `resolveGroupMembershipType` and `isOwnedMembership` treat only legacy `virtual` Agents as Group-owned. A shared coordinator survives Group removal, deletion, duplication, publication and ownership transfer with its own config, workspace, owner and visibility.
- **Settings UI** (`src/features/GroupProfile`) shows Description and the member list. The coordinator is marked in its row and another eligible member can be promoted from its row. Opening message, opening questions and the separate coordinator runtime panel are gone.

No schema change is involved: the role lives on the existing junction row.
