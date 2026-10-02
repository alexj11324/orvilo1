# Search & Configuration Commands

## Global Search (`orvilo search`)

Search across all Orvilo resource types.

**Source**: `apps/cli/src/commands/search.ts`

### `orvilo search <query>`

```bash
orvilo search "meeting notes" [-t [-L [--json [fields]] < type > ] < n > ]
```

| Option              | Description             | Default   |
| ------------------- | ----------------------- | --------- |
| `-t, --type <type>` | Filter by resource type | All types |
| `-L, --limit <n>`   | Results per type        | `10`      |

### Searchable Types

| Type             | Description                  |
| ---------------- | ---------------------------- |
| `agent`          | AI agents                    |
| `topic`          | Conversation topics          |
| `file`           | Uploaded files               |
| `folder`         | File folders                 |
| `message`        | Chat messages                |
| `page`           | Documents/pages              |
| `memory`         | User memories                |
| `mcp`            | MCP servers                  |
| `plugin`         | Installed plugins            |
| `communityAgent` | Community marketplace agents |
| `knowledgeBase`  | Knowledge bases              |

**Output**: Results grouped by type, showing ID, title/name, description.

---

## User Configuration (`orvilo whoami` / `orvilo usage`)

**Source**: `apps/cli/src/commands/config.ts`

### `orvilo whoami`

Display current authenticated user information.

```bash
orvilo whoami [--json [fields]]
```

**Displays**: Name, username, email, user ID, subscription plan.

### `orvilo usage`

Display usage statistics.

```bash
orvilo usage [--month [--daily] [--json [fields]] < YYYY-MM > ]
```

| Option              | Description    | Default                 |
| ------------------- | -------------- | ----------------------- |
| `--month <YYYY-MM>` | Month to query | Current month           |
| `--daily`           | Group by day   | `false` (monthly total) |

**Output**: Token usage, costs, and model breakdown for the specified period.

---

## Workspace (`orvilo workspace`)

Aliased `orvilo ws`. Workspace membership is a cloud feature; on an open-source
deployment these procedures answer empty or `NOT_IMPLEMENTED`.

### Scope

| Command                           | Description                                            |
| --------------------------------- | ------------------------------------------------------ |
| `orvilo workspace current`        | Which scope commands run under, and where it came from |
| `orvilo workspace use <id\|slug>` | Persist the scope for subsequent commands              |
| `orvilo workspace use --personal` | Drop back to personal content                          |

Resolution order is `--workspace` → `ORVILO_WORKSPACE_ID` → the persisted scope
→ personal. Setting the persisted scope while `ORVILO_WORKSPACE_ID` is exported
prints a warning, because the env var still wins.

The persisted scope lives in `~/.orvilo/active-workspace` together with the
account (`sub` claim) and server URL it was chosen under. Switching account or
server invalidates it; `orvilo logout` deletes it. API-key auth has no local account
identity, so `workspace use` refuses to save under it — use the env var.

### Reads

| Command                        | Description                                           |
| ------------------------------ | ----------------------------------------------------- |
| `orvilo workspace list`        | Workspaces you belong to; `*` marks the effective one |
| `orvilo workspace view [id]`   | Workspace detail                                      |
| `orvilo workspace settings`    | The workspace settings blob                           |
| `orvilo workspace stats`       | Content totals — admin only; `--mine` for your own    |
| `orvilo workspace usage`       | Credit spend by type for the billing window           |
| `orvilo workspace members`     | Members with role and email                           |
| `orvilo workspace invitations` | Pending invitations (admin)                           |
| `orvilo workspace audit-log`   | Audit entries (admin, Business plan)                  |

### Writes

| Command                                 | Description                                     |
| --------------------------------------- | ----------------------------------------------- |
| `orvilo workspace create <name> --slug` | Create a workspace; `--use` switches into it    |
| `orvilo workspace update`               | Name / slug / description / avatar (admin)      |
| `orvilo workspace invite <email>`       | Invite a member, `--role admin\|member\|viewer` |

Slugs are 3–32 chars, lowercase alphanumerics with inner hyphens. Deleting a
workspace and removing members are deliberately not exposed here.

---

## Global Options

These options are available across most commands:

| Option            | Description                                                            |
| ----------------- | ---------------------------------------------------------------------- |
| `--json [fields]` | Output as JSON; optionally filter to specific fields (comma-separated) |
| `--yes`           | Skip confirmation prompts for destructive operations                   |
| `-L, --limit <n>` | Pagination limit for list commands                                     |
| `-v, --verbose`   | Enable verbose/debug logging                                           |
| `--help`          | Show command help                                                      |
| `--version`       | Show CLI version                                                       |

### JSON Field Filtering

The `--json` option supports field selection:

```bash
# Full JSON output
orvilo agent list --json

# Only specific fields
orvilo agent list --json "id,title,model"
```
