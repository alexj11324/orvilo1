# Conversation Commands (Topic & Message)

## Topic Management (`orvilo topic`)

Manage conversation topics (threads).

**Source**: `apps/cli/src/commands/topic.ts`

### `orvilo topic list`

```bash
orvilo topic list [--agent-id [-L [--page [--json [fields]] < id > ] < n > ] < n > ]
```

| Option            | Description     | Default |
| ----------------- | --------------- | ------- |
| `--agent-id <id>` | Filter by agent | -       |
| `-L, --limit <n>` | Page size       | `30`    |
| `--page <n>`      | Page number     | `1`     |

**Table columns**: ID, TITLE, FAV, UPDATED

### `orvilo topic search <keywords>`

```bash
orvilo topic search [--json [fields]] < keywords > [--agent-id < id > ]
```

### `orvilo topic create`

```bash
orvilo topic create -t [--favorite] < title > [--agent-id < id > ]
```

| Option                | Description          | Required |
| --------------------- | -------------------- | -------- |
| `-t, --title <title>` | Topic title          | Yes      |
| `--agent-id <id>`     | Associate with agent | No       |
| `--favorite`          | Mark as favorite     | No       |

### `orvilo topic edit <id>`

```bash
orvilo topic edit [--favorite] [--no-favorite] < id > [-t < title > ]
```

### `orvilo topic delete <ids...>`

```bash
orvilo topic delete [--yes] < id1 > [id2...]
```

### `orvilo topic recent`

```bash
orvilo topic recent [-L [--json [fields]] < n > ]
```

| Option            | Description     | Default |
| ----------------- | --------------- | ------- |
| `-L, --limit <n>` | Number of items | `10`    |

---

## Message Management (`orvilo message`)

Manage chat messages within topics.

**Source**: `apps/cli/src/commands/message.ts`

### `orvilo message list`

```bash
orvilo message list [options] [--json [fields]]
```

| Option            | Description             | Default |
| ----------------- | ----------------------- | ------- |
| `--topic-id <id>` | Filter by topic         | -       |
| `--agent-id <id>` | Filter by agent         | -       |
| `-L, --limit <n>` | Page size               | `30`    |
| `--page <n>`      | Page number             | `1`     |
| `--user`          | Only show user messages | -       |

**Table columns**: ID, ROLE, CONTENT, CREATED

**Note**: When `--topic-id` or `--agent-id` is provided, uses `message.getMessages`; otherwise uses `message.listAll`.

### `orvilo message search <keywords>`

```bash
orvilo message search [fields]] < keywords > [--json
```

Full-text search across all messages.

### `orvilo message delete <ids...>`

```bash
orvilo message delete [--yes] < id1 > [id2...]
```

### `orvilo message count`

```bash
orvilo message count [--start [--end [--json] < date > ] < date > ]
```

| Option           | Description                                |
| ---------------- | ------------------------------------------ |
| `--start <date>` | Start date (ISO format, e.g. `2024-01-01`) |
| `--end <date>`   | End date (ISO format)                      |

**Output**: Total message count for the specified period.

### `orvilo message heatmap`

```bash
orvilo message heatmap [--json]
```

**Output**: Activity heatmap data showing message frequency over time.
