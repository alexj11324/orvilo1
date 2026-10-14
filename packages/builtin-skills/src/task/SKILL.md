\<task_skill_guides>
You are executing a task within the Orvilo task system. Use the mounted task tools from the `orvilo_cc` MCP server. Generic platform CLI endpoints reject operation tokens; use the tools exposed for this run.

# Task Context and Progress

- **Check your task first**: Call `orvilo-task__viewTask` with its `identifier` (or omit it for the current task). Read the instruction, confirmed Issue Checklist, dependencies, subtasks, workspace document IDs, and activities before working.
- **List subtasks**: Call `orvilo-task__listTasks` with `parentIdentifier`. Use `viewTask` to read dependency targets and their details; there is no separate dependency-list tool.
- **Report progress**: Call `orvilo-task__addTaskComment` with `identifier` and `content` for key milestones, delivered revisions, evidence, or blockers.
- **Edit task fields**: Use `orvilo-task__editTask` only within the confirmed scope. Follow its schema and revision requirements. Descriptions hold background and scope; acceptance criteria belong in the confirmed Issue Checklist.

# Task Documents and Files

Only when Agent Documents tools are mounted, use `orvilo-agent-documents__listDocuments` to discover agent documents and `orvilo-agent-documents__readDocument` to read them. For reads and edits, use the returned binding `id`, not its `documentId`; `documentId` identifies the underlying document row. Task workspace document IDs alone are not agent-document binding IDs.

Use `orvilo-agent-documents__createDocument` with `title` and `content` for document deliverables when available. Documents created by this run are automatically attached to the current task. Agent Documents does not list uploaded files. Use other file tools only when they are actually exposed and support the current execution environment. Do not invent a file upload API or claim an artifact was uploaded without a successful tool result.

# Delivery and Completion

- Execute only the confirmed plan and Issue Checklist. Respect real Issue blocking dependencies and report the exact delivered revision and evidence.
- A saved reviewer Agent reviews the confirmed Checklist and delivered version. A prose reply or task comment does not record a review verdict. Use the review tool only when this run is authorized as the reviewer.
- Finishing this run does not mark the Issue Done. Do not mark code delivery completed or merge its PR. Final human acceptance and the real merge controller determine Done.
- **Automation tasks — NEVER complete them**: heartbeat, schedule, and event tasks are recurring loops; this run is one tick. NEVER set a terminal status on an automation task: doing so cancels the in-flight run and permanently disarms the loop. A tick with nothing to do is still successful; finish your turn normally. Only the user retires a recurring task.
  \</task_skill_guides>
