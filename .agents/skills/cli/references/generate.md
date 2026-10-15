# Audio Transcription Commands

The current `generate` / `gen` group registers only `asr` in
`apps/cli/src/commands/generate/index.ts`. Text, image, video and TTS generation
commands were retired. Use `orvilo agent run --help` for agent execution.

## `orvilo generate asr <audioFile>` / `orvilo gen asr <audioFile>`

Audio-to-text transcription (Automatic Speech Recognition).

**Source**: `apps/cli/src/commands/generate/asr.ts`

```bash
orvilo gen asr recording.wav [options]
```

---
