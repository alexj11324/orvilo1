# Content Generation Commands

Generate text, speech, and transcriptions.

**Source**: `apps/cli/src/commands/generate/`

## Command Structure

```
lh generate (alias: gen)
├── text <prompt>                          # Text generation
├── tts <text>                             # Text-to-speech
└── asr <audioFile>                        # Audio-to-text (speech recognition)
```

---

## `lh generate text <prompt>` / `lh gen text <prompt>`

Generate text completion.

**Source**: `apps/cli/src/commands/generate/text.ts`

```bash
lh gen text "Explain quantum computing" [options]
echo "context" | lh gen text "summarize" --pipe
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
cat README.md | lh gen text "summarize this" --pipe
```

---

## `lh generate tts <text>` / `lh gen tts <text>`

Text-to-speech generation.

**Source**: `apps/cli/src/commands/generate/tts.ts`

```bash
lh gen tts "Hello, world!" [options]
```

---

## `lh generate asr <audioFile>` / `lh gen asr <audioFile>`

Audio-to-text transcription (Automatic Speech Recognition).

**Source**: `apps/cli/src/commands/generate/asr.ts`

```bash
lh gen asr recording.wav [options]
```

---
