# Group members and existing coordinator

Targets: GroupProfile/CreateGroup UI, agentGroup router, ChatGroupModel/AgentGroupRepository and groupMembership ownership helpers.
Explicit user exception: group configuration contains Description and members only. Agent rows show brand+name, coordinator badge inline. Remove opening/questions, runtime/device/status panels and current-selection summaries.
Coordinator MUST be an existing selected member Agent ID. No virtual supervisor creation or getGroup fallback. Creation/update validate member access and unique coordinator atomically. Reuse junction agentId+role already available, don't create new table/model.
Role does not imply Agent ownership. Shared coordinator survives Group remove/delete/copy/publish/transfer, maintains original Agent config/workspace/user/visibility. Legacy actual virtual owned members remain owned. Reject unauthorized selection; never expose private Agent config to other Group users.
Group BasicSettings currently writes content; preserve real Description/markdown persistence consistently with its current model, no fake duplicate field.
Group creation only via group page and same simple members/coordinator model; coordinator selection is member-row role action, not another runtime source section.
Regression before/fix: create doesn't insert supervisor Agent; selecting coordinator preserves ID; removal/deletion doesn't delete shared coordinator; ACL preserved; reads never create agents. Package-owning database tests, router tests and existing UI tests. No migrations unless an observed current schema blocker. No local tsgo.
