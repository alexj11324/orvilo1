# Orchestration workflow planning lease

Initial decomposition claims a bounded coordinator lease through `OrchestrationWorkflowModel.claimPlanning`. The claim carries a token, expiry and previous state in `config.planningCheckpoint`; the retained `planningProtocol` identifies lease-aware retries.

Planning runs through the scope's Orchestrator ACP operation. It does not hold a database lock while waiting for the Agent. The commit transaction rechecks the current token, expiry, state and authoritative requirement, then writes the bounded task nodes and their dependencies atomically. A stale claimant cannot commit over a newer plan or duplicate the initial nodes.

Human plan confirmation precedes this lease. An unconfirmed row is held with `plan_not_confirmed`; `config.planConfirmedAt` is server-stamped after approval. The independent CLI/MCP approval receipt binds the complete proposed arguments and current decision window before any creation occurs.

Migration `0212_orchestration_workflow` preserves existing rows, lease tokens and graph relationships while renaming their SQL and application names. Existing admitted rows receive the confirmation marker. It does not drop or recreate the graph.

`caid_dispatch` defaults to enabled for the product main line. Explicitly disabling it holds new dispatches with `caid_dispatch_disabled`; it does not revoke a pending lease or authorize an unconfirmed plan. See [the backend contract](./agent-orchestration-workflows-design.md) for the conversation card's status procedure.
