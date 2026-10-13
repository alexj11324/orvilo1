# Issues and orchestration workflows

The user tells the workspace Orchestrator what they want in ordinary language. The Orchestrator answers questions directly and proposes an **orchestration workflow (编排工作流)** for work that should be delivered through Issues.

The Orchestrator creates a parent Issue and its sub-Issues in Backlog, then posts their descriptions, acceptance criteria, assignees, reviewers, dependencies and budgets in the conversation. The person confirms by replying there, or asks for changes to the ordinary Issues. There is no Start or confirmation button. A durable split marker keeps these Issues out of intake and dispatch until a later user message allows the Orchestrator to release them.

After confirmation, the Orchestrator owns the orchestration workflow. Its coordinator executes those Issues, respects dependencies and parallelism, dispatches attempts, collects deliverables, merges isolated workspaces and opens decisions when progress needs a person. The Agent does not duplicate this work in the originating conversation.

The conversation card can pause/resume with `orchestrationWorkflow.pause/resume`, query and answer open decisions with `listDecisions/decide`, link to `listIssues`, and describe `getStatus.waitingReason`. A disabled dispatch gate and an offline device are distinct states. `caid_dispatch` is enabled by default and supports an explicit off override.

There is no separate product entry for orchestration workflows. Conversation, Issues and the board carry the experience. The frontend owner removes the former pages and command chips and puts the controls on the conversation card.

See [the backend design and procedure contract](./agent-orchestration-workflows-design.md) for ownership, persistence, confirmation and inference details. Always use the full term; the Issue status model's `workflowCategory` and `workflowState` are separate names.
