# Content Generation Commands

Generate text, speech, and transcriptions.

**Source**: `apps/cli/src/commands/generate/`

## Command Structure

```
orvilo generate (alias: gen)
├── text <prompt>                          # Text generation
└── asr <audioFile>                        # Audio-to-text (speech recognition)
```

---

## `orvilo generate text <prompt>` / `orvilo gen text <prompt>`

Generate text completion.

**Source**: `apps/cli/src/commands/generate/text.ts`

```bash
orvilo gen text "Explain quantum computing" [options]
echo "context" | orvilo gen text "summarize" --pipe
```

| Option                      | Description                        | Default              |
| --------------------------- | ---------------------------------- | -------------------- |
| `-m, --model <model>`       | Model ID                           | `openai/gpt-4o-mini` |
| `-p, --provider <provider>` | Provider name                      | -                    |
| `-s, --system <prompt>`     | System prompt                      | -                    |
| `--temperature <n>`         | Temperature (0-2)                  | -                    |
| `--max-tokens <n>`          | Maximum output tokens              | -                    |
| `--stream`                  | Enable streaming output            | `false`              |
| `--json`                    | Output full JSON response          | `false`              |
| `--pipe`                    | Read additional context from stdin | `false`              |

### Pipe Mode

When `--pipe` is used, reads stdin and prepends it to the prompt. Useful for piping file contents:

```bash
cat README.md | orvilo gen text "summarize this" --pipe
```

---

## `orvilo generate asr <audioFile>` / `orvilo gen asr <audioFile>`

Audio-to-text transcription (Automatic Speech Recognition).

**Source**: `apps/cli/src/commands/generate/asr.ts`

```bash
orvilo gen asr recording.wav [options]
```

---
