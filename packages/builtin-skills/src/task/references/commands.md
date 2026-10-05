# orvilo task - Complete Command Reference

## Core Commands

- `orvilo task list [--status <status>] [--root] [--parent <id>] [--agent <id>] [-L <limit>] [--tree]` - List tasks
  - `--status`: pending, running, paused, completed, failed, canceled
  - `--root`: Only root tasks (no parent)
  - `--tree`: Display as tree structure
- `orvilo task view <id>` - View task details (instruction, workspace, activities)
- `orvilo task create -i <instruction> [-n <name>] [--agent <id>] [--parent <id>] [--priority <0-4>]` - Create task
  - Priority: 0=none, 1=urgent, 2=high, 3=normal, 4=low
- `orvilo task edit <id> [-n <name>] [-i <instruction>] [--status <status>] [--priority <0-4>] [--agent <id>]` - Update task
- `orvilo task delete <id> [--yes]` - Delete task
- `orvilo task clear [--yes]` - Delete all tasks
- `orvilo task tree <id>` - Show subtask tree with dependencies

## Lifecycle Commands

- `orvilo task start <id> [--no-run] [-p <prompt>] [-f] [-v]` - Start task (pending → running)
  - `--no-run`: Only update status, skip agent execution
  - `-f, --follow`: Follow agent output in real-time
  - `-v, --verbose`: Show detailed tool call info
- `orvilo task run <id> [-p <prompt>] [-c <topicId>] [-f] [--topics <n>] [--delay <s>]` - Run/re-run agent execution
  - `-c, --continue`: Continue on existing topic
  - `--topics <n>`: Run N topics in sequence
- `orvilo task pause <id>` - Pause running task
- `orvilo task resume <id>` - Resume paused task
- `orvilo task complete <id>` - Mark as completed
- `orvilo task cancel <id>` - Cancel task
- `orvilo task comment <id> -m <message>` - Add comment
- `orvilo task sort <parentId> <id1> <id2> ...` - Reorder subtasks
- `orvilo task heartbeat <id>` - Send manual heartbeat
- `orvilo task watchdog` - Detect and fail stuck tasks

## Checkpoint Commands

- `orvilo task checkpoint view <id>` - View checkpoint config
- `orvilo task checkpoint set <id> [--on-agent-request <bool>] [--topic-before <bool>] [--topic-after <bool>] [--before <ids>] [--after <ids>]` - Configure checkpoints
  - `--on-agent-request`: Allow agent to request review
  - `--topic-before/after`: Pause before/after each topic
  - `--before/after <ids>`: Pause before/after specific subtask identifiers

## Review Commands (LLM-as-Judge)

- `orvilo task review view <id>` - View review config
- `orvilo task review set <id> [--model <model>] [--provider <provider>] [--max-iterations <n>] [--no-auto-retry] [--recursive]` - Configure review
- `orvilo task review criteria list <id>` - List review rubrics
- `orvilo task review criteria add <id> -n <name> [--type <type>] [-t <threshold>] [-d <description>] [--value <value>] [--pattern <pattern>] [-w <weight>] [--recursive]` - Add rubric
  - Types: llm-rubric, contains, equals, starts-with, ends-with, regex
  - Threshold: 0-100
- `orvilo task review criteria rm <id> -n <name> [--recursive]` - Remove rubric
- `orvilo task review run <id> --content <text>` - Manually run review

## Dependency Commands

- `orvilo task dep add <taskId> <dependsOnId> [--type <blocks|relates>]` - Add dependency
- `orvilo task dep rm <taskId> <dependsOnId>` - Remove dependency
- `orvilo task dep list <taskId>` - List dependencies

## Topic Commands

- `orvilo task topic list <id>` - List topics for task
- `orvilo task topic view <id> <topicId>` - View topic messages (topicId can be seq number like "1")
- `orvilo task topic cancel <topicId>` - Cancel running topic and pause task
- `orvilo task topic delete <topicId> [--yes]` - Delete topic and messages

## Document Commands (Workspace)

- `orvilo task doc create <id> -t <title> [-b <content>] [--parent <docId>] [--folder]` - Create and pin document
- `orvilo task doc pin <id> <documentId>` - Pin existing document
- `orvilo task doc unpin <id> <documentId>` - Unpin document
- `orvilo task doc mv <id> <documentId> <folder>` - Move document into folder (auto-creates folder)

## Tips

- All commands support `--json [fields]` for structured output
- Task identifiers use format like TASK-1, TASK-2, etc.
- Use `orvilo task tree` to visualize full task hierarchy before planning work
- Use `orvilo task comment` to log progress — comments appear in task activities
- Documents in workspace are accessible to the agent during execution
