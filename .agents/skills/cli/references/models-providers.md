# Model & Provider Commands

## Model Management (`orvilo model`)

Manage AI models within providers.

**Source**: `apps/cli/src/commands/model.ts`

### `orvilo model list <providerId>`

List models for a specific provider.

```bash
orvilo model list openai
orvilo model list openai --type image --enabled
orvilo model list orvilo --type video --json
```

| Option            | Description                                                                            | Default |
| ----------------- | -------------------------------------------------------------------------------------- | ------- |
| `-L, --limit <n>` | Maximum items                                                                          | `50`    |
| `--enabled`       | Only show enabled models                                                               | `false` |
| `--type <type>`   | Filter by model type (`chat\|embedding\|tts\|stt\|image\|video\|text2music\|realtime`) | -       |
| `--json [fields]` | Output JSON, optionally specify fields                                                 | -       |

**Table columns**: ID, NAME, ENABLED, TYPE

**Backend**: `aiModel.getAiProviderModelList` → `AiInfraRepos.getAiProviderModelList` (supports `type` filter at repository level)

### `orvilo model view <id>`

```bash
orvilo model view [fields]] < modelId > [--json
```

**Displays**: Name, provider, type, enabled status, capabilities.

### `orvilo model create`

```bash
orvilo model create --id [--type < id > --provider < providerId > [--display-name < name > ] < type > ]
```

| Option                    | Description  | Default  |
| ------------------------- | ------------ | -------- |
| `--id <id>`               | Model ID     | Required |
| `--provider <providerId>` | Provider ID  | Required |
| `--display-name <name>`   | Display name | -        |
| `--type <type>`           | Model type   | `chat`   |

### `orvilo model edit <id>`

```bash
orvilo model edit [--type < modelId > --provider < providerId > [--display-name < name > ] < type > ]
```

### `orvilo model toggle <id>`

Enable or disable a model.

```bash
orvilo model toggle < modelId > --provider < providerId > --enable
orvilo model toggle < modelId > --provider < providerId > --disable
```

| Option                    | Description       | Required     |
| ------------------------- | ----------------- | ------------ |
| `--provider <providerId>` | Provider ID       | Yes          |
| `--enable`                | Enable the model  | One required |
| `--disable`               | Disable the model | One required |

### `orvilo model batch-toggle <ids...>`

Enable or disable multiple models at once.

```bash
orvilo model batch-toggle model1 model2 model3 --provider openai --enable
```

### `orvilo model delete <id>`

```bash
orvilo model delete < modelId > --provider < providerId > [--yes]
```

### `orvilo model clear`

Clear all models (or only remote/fetched models) for a provider.

```bash
orvilo model clear --provider [--yes] < providerId > [--remote]
```

---

## Provider Management (`orvilo provider`)

Manage AI service providers.

**Source**: `apps/cli/src/commands/provider.ts`

### `orvilo provider list`

```bash
orvilo provider list [--json [fields]]
```

**Table columns**: ID, NAME, ENABLED, SOURCE

### `orvilo provider view <id>`

```bash
orvilo provider view [fields]] < providerId > [--json
```

**Displays**: Name, enabled status, source, configuration.

### `orvilo provider create`

```bash
orvilo provider create --id [-d [--logo [--sdk-type < id > -n < name > [-s < source > ] < desc > ] < url > ] < type > ]
```

| Option                     | Description                                       | Default  |
| -------------------------- | ------------------------------------------------- | -------- |
| `--id <id>`                | Provider ID                                       | Required |
| `-n, --name <name>`        | Provider name                                     | Required |
| `-s, --source <source>`    | Source type (`builtin` or `custom`)               | `custom` |
| `-d, --description <desc>` | Provider description                              | -        |
| `--logo <logo>`            | Provider logo URL                                 | -        |
| `--sdk-type <sdkType>`     | SDK type (openai, anthropic, azure, bedrock, ...) | -        |

### `orvilo provider edit <id>`

```bash
orvilo provider edit [-d [--logo [--sdk-type < providerId > [-n < name > ] < desc > ] < url > ] < type > ]
```

Requires at least one change flag.

### `orvilo provider config <id>`

Configure provider settings (API key, base URL, etc.).

```bash
orvilo provider config openai --api-key sk-xxx
orvilo provider config openai --base-url https://custom-endpoint.com
orvilo provider config openai --show
orvilo provider config openai --show --json
```

| Option                   | Description                       |
| ------------------------ | --------------------------------- |
| `--api-key <key>`        | Set API key                       |
| `--base-url <url>`       | Set base URL                      |
| `--check-model <model>`  | Set connectivity check model      |
| `--enable-response-api`  | Enable Response API mode (OpenAI) |
| `--disable-response-api` | Disable Response API mode         |
| `--fetch-on-client`      | Enable fetching models on client  |
| `--no-fetch-on-client`   | Disable fetching models on client |
| `--show`                 | Show current config               |
| `--json [fields]`        | Output JSON (with --show)         |

**Important**: The `orvilo` provider is platform-managed. Attempting to set `--api-key` or `--base-url` on it will be rejected with an error message.

### `orvilo provider test <id>`

Test provider connectivity.

```bash
orvilo provider test openai
orvilo provider test openai -m gpt-4o --json
```

### `orvilo provider toggle <id>`

```bash
orvilo provider toggle < providerId > --enable
orvilo provider toggle < providerId > --disable
```

### `orvilo provider delete <id>`

```bash
orvilo provider delete < providerId > [--yes]
```
