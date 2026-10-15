# Plugin Commands

The standalone `orvilo skill` command was retired. Current command registration
is owned by `apps/cli/src/program.ts`; plugin operations remain available.

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
