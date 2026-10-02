# Skill & Plugin Commands

## Skill Management (`orvilo skill`)

Manage agent skills (custom instructions and capabilities).

**Source**: `apps/cli/src/commands/skill.ts`

### `orvilo skill list`

```bash
orvilo skill list [--source [--json [fields]] < source > ]
```

| Option              | Description                         |
| ------------------- | ----------------------------------- |
| `--source <source>` | Filter: `builtin`, `market`, `user` |

**Table columns**: ID, NAME, DESCRIPTION, SOURCE, IDENTIFIER

### `orvilo skill view <id>`

```bash
orvilo skill view [fields]] < id > [--json
```

**Displays**: Name, description, source, identifier, content.

### `orvilo skill create`

```bash
orvilo skill create -n < name > -d < desc > -c < content > [-i < identifier > ]
```

| Option                     | Description                         | Required |
| -------------------------- | ----------------------------------- | -------- |
| `-n, --name <name>`        | Skill name                          | Yes      |
| `-d, --description <desc>` | Description                         | Yes      |
| `-c, --content <content>`  | Skill content (prompt/instructions) | Yes      |
| `-i, --identifier <id>`    | Custom identifier                   | No       |

### `orvilo skill edit <id>`

```bash
orvilo skill edit [-n [-d < id > [-c < content > ] < name > ] < desc > ]
```

### `orvilo skill delete <id>`

```bash
orvilo skill delete < id > [--yes]
```

### `orvilo skill search <query>`

```bash
orvilo skill search [fields]] < query > [--json
```

### `orvilo skill install <source>` (alias: `orvilo skill i`)

Install a skill. Auto-detects source type from the input:

```bash
# GitHub (URL or owner/repo shorthand)
orvilo skill install aspectlylabs/skill-repo
orvilo skill install https://github.com/aspectlylabs/skill-repo
orvilo skill install aspectlylabs/skill-repo --branch dev

# ZIP URL
orvilo skill install https://example.com/skill.zip

# Marketplace identifier
orvilo skill install my-cool-skill
orvilo skill i my-cool-skill
```

| Option              | Description               | Notes    |
| ------------------- | ------------------------- | -------- |
| `--branch <branch>` | Branch name (GitHub only) | Optional |

**Detection rules**:

- `https://github.com/...` or `owner/repo` → GitHub
- Other `https://...` URLs → ZIP URL
- Everything else → marketplace identifier

### Resource Commands

#### `orvilo skill resources <id>`

List files/resources within a skill.

```bash
orvilo skill resources [fields]] < id > [--json
```

**Displays**: Path, type, size.

#### `orvilo skill read-resource <id> <path>`

Read a specific resource file from a skill.

```bash
orvilo skill read-resource <skillId> <path>
```

**Output**: File content or JSON metadata.

---

## Plugin Management (`orvilo plugin`)

Install and manage plugins (external tool integrations).

**Source**: `apps/cli/src/commands/plugin.ts`

### `orvilo plugin list`

```bash
orvilo plugin list [--json [fields]]
```

**Table columns**: ID, IDENTIFIER, TYPE, TITLE

### `orvilo plugin install`

```bash
orvilo plugin install -i [--settings < identifier > --manifest < json > [--type < type > ] < json > ]
```

| Option                  | Description                | Required               |
| ----------------------- | -------------------------- | ---------------------- |
| `-i, --identifier <id>` | Plugin identifier          | Yes                    |
| `--manifest <json>`     | Plugin manifest JSON       | Yes                    |
| `--type <type>`         | `plugin` or `customPlugin` | No (default: `plugin`) |
| `--settings <json>`     | Plugin settings JSON       | No                     |

### `orvilo plugin uninstall <id>`

```bash
orvilo plugin uninstall < id > [--yes]
```

### `orvilo plugin update <id>`

```bash
orvilo plugin update [--settings < id > [--manifest < json > ] < json > ]
```
