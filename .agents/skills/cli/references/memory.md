# Memory Commands

Manage user memories - the AI's long-term knowledge about users.

**Source**: `apps/cli/src/commands/memory.ts`

## Memory Categories

| Category     | Description                               |
| ------------ | ----------------------------------------- |
| `identity`   | User's name, role, relationships          |
| `activity`   | Recent activities and their status        |
| `context`    | Ongoing contexts, projects, goals         |
| `experience` | Past experiences and key learnings        |
| `preference` | User preferences, directives, suggestions |

---

## `orvilo memory list [category]`

List memory entries, optionally filtered by category.

```bash
orvilo memory list            # All categories
orvilo memory list identity   # Only identity memories
orvilo memory list preference # Only preferences
```

| Option            | Description |
| ----------------- | ----------- |
| `--json [fields]` | JSON output |

**Output**: Grouped by category, showing type/status and descriptions.

---

## `orvilo memory create`

Create a new identity memory entry.

```bash
orvilo memory create [options]
```

| Option                     | Description              |
| -------------------------- | ------------------------ |
| `--type <type>`            | Memory type              |
| `--role <role>`            | User's role              |
| `--relationship <rel>`     | Relationship description |
| `-d, --description <desc>` | Description              |
| `--labels <labels...>`     | Extracted labels         |

---

## `orvilo memory edit <category> <id>`

Edit a memory entry. Options vary by category:

```bash
orvilo memory edit identity < id > [options]
orvilo memory edit activity < id > [options]
orvilo memory edit context < id > [options]
orvilo memory edit experience < id > [options]
orvilo memory edit preference < id > [options]
```

### Category-specific Options

**identity**:

- `--type <type>`, `--role <role>`, `--relationship <rel>`

**activity**:

- `--narrative <text>`, `--notes <text>`, `--status <status>`

**context**:

- `--title <title>`, `--description <desc>`, `--status <status>`

**experience**:

- `--situation <text>`, `--action <text>`, `--key-learning <text>`

**preference**:

- `--directives <text>`, `--suggestions <text>`

---

## `orvilo memory delete <category> <id>`

```bash
orvilo memory delete identity < id > [--yes]
```

---

## `orvilo memory persona`

Display the compiled memory persona summary.

```bash
orvilo memory persona [--json [fields]]
```

**Output**: Summarized user profile built from all memory categories.

---

## `orvilo memory extract`

Trigger async memory extraction from chat history.

```bash
orvilo memory extract [--from [--to < date > ] < date > ]
```

| Option          | Description             |
| --------------- | ----------------------- |
| `--from <date>` | Start date (ISO format) |
| `--to <date>`   | End date (ISO format)   |

Starts a background task that analyzes chat history and creates new memory entries.

---

## `orvilo memory extract-status`

Check the status of a memory extraction task.

```bash
orvilo memory extract-status [--task-id [--json [fields]] < id > ]
```

| Option           | Description         |
| ---------------- | ------------------- |
| `--task-id <id>` | Check specific task |
