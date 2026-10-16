# Orchestration workflow graph CLI

The namespace is `orvilo orchestration-workflow`. Trace commands use **`orvilo trace orchestration-workflow`**. There are no aliases for the former namespace.

```sh
orvilo orchestration-workflow list --json
orvilo orchestration-workflow show <id> --json
orvilo orchestration-workflow pause <id>
orvilo orchestration-workflow resume <id>
orvilo orchestration-workflow decide <id> <decision-id> <option-id>
orvilo trace orchestration-workflow list
orvilo trace orchestration-workflow inspect <id>
```

The user's normal entry is a plain-language request to the workspace Orchestrator. Internal/operator CLI commands retain graph inspection, creation, decisions and controls. Creation resolves ownership to the configured Orchestrator, and printed navigation leads to Issues.

Structured planning operations submit their output through:

```sh
orvilo orchestration-workflow submit-draft --token <token> --file <json-path>
orvilo orchestration-workflow plan <id> --token <token> --file <json-path> --json
```

An operation-bound token is restricted to its own active operation and planning turn. The MCP prepare tool creates a board split and posts it in the originating conversation; its start tool can release that split only after a later user reply in the same conversation. Operator creation leaves an unconfirmed graph; it does not bypass this admission.

The graph remains the engine's problem/task/experiment/decision/evidence structure. A Task node owns a normal Issue and execution attempt; it is not a replacement Issue status model. API consumers can use `orchestrationWorkflow.listIssues`, `listDecisions` and `getStatus` without loading this graph.
