# @orvilo/cli

Orvilo command-line interface.

## Install a release package

Requires Node.js **22.15 or newer**. Download the `orvilo-cli-*.tgz` asset from an
[Orvilo release](https://github.com/alexj11324/orvilo1/releases) that includes it,
then install that downloaded file:

```bash
npm install --global ./orvilo-cli-*.tgz
orvilo --version
orvilo login
orvilo connect
```

The tarball includes the built CLI, the Prime runner and its provenance manifest,
and the man page. It does not need this repository or its workspace dependencies.
The release workflow tests installation outside the workspace before attaching
the package to a stable GitHub Release. Releases without a CLI asset do not
support this installation path.

Run `orvilo update --check` to check the latest stable release's CLI asset, or
`orvilo update` to install it. `--tag` selects a specific GitHub release tag.

## Local Development

| Task                          | Command                    |
| ----------------------------- | -------------------------- |
| Run in dev mode               | `bun run dev -- <command>` |
| Build the CLI                 | `bun run build`            |
| Link `orvilo` into your shell | `bun run cli:link`         |
| Remove the global link        | `bun run cli:unlink`       |

- `bun run build` generates `dist/index.js` and stages the Prime runner artifacts.
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
