# @orvilo/cli

Orvilo command-line interface.

## Local Development

| Task                                            | Command                    |
| ----------------------------------------------- | -------------------------- |
| Run in dev mode                                 | `bun run dev -- <command>` |
| Build the CLI                                   | `bun run build`            |
| Link `orvilo`/`orvilo`/`orvilo` into your shell | `bun run cli:link`         |
| Remove the global link                          | `bun run cli:unlink`       |

- `bun run build` only generates `dist/index.js`.
- To make `orvilo` available in your shell, run `bun run cli:link`.
- After linking, if your shell still cannot find `orvilo`, run `rehash` in `zsh`.

## Custom Server URL

By default the CLI connects to `https://orvilo.aspectlylabs.com`. To point it at a different server (e.g. a local instance):

| Method               | Command                                                        | Persistence                        |
| -------------------- | -------------------------------------------------------------- | ---------------------------------- |
| Environment variable | `ORVILO_SERVER=http://localhost:4000 bun run dev -- <command>` | Current command only               |
| Login flag           | `orvilo login --server http://localhost:4000`                  | Saved to `~/.orvilo/settings.json` |

Priority: `ORVILO_SERVER` env var > `settings.json` > default official URL.

## Shell Completion

### Install completion for a linked CLI

| Shell  | Command                            |
| ------ | ---------------------------------- |
| `zsh`  | `source <(orvilo completion zsh)`  |
| `bash` | `source <(orvilo completion bash)` |

### Use completion during local development

| Shell  | Command                                      |
| ------ | -------------------------------------------- |
| `zsh`  | `source <(bun src/index.ts completion zsh)`  |
| `bash` | `source <(bun src/index.ts completion bash)` |

- Completion is context-aware. For example, `orvilo agent <Tab>` shows agent subcommands instead of top-level commands.
- If you update completion logic locally, re-run the corresponding `source <(...)` command to reload it in the current shell session.
- Completion only registers shell functions. It does not install the `orvilo` binary by itself.

## Quick Check

```bash
which orvilo
orvilo --help
orvilo agent <TAB>
```
