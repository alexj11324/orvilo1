const content = `# orvilo gen - Content Generation

Generate text, images, videos, and audio. Alias: \`orvilo generate\`.

## Subcommands

- \`orvilo gen text <prompt> [-m <model>] [-p <provider>] [--stream] [--temperature <t>]\` - Generate text
- \`orvilo gen image <prompt> [-m <model>] [-n <count>] [--width <w>] [--height <h>]\` - Generate image
- \`orvilo gen video <prompt> -m <model> -p <provider> [--aspect-ratio <r>] [--duration <d>] [--resolution <res>]\` - Generate video
- \`orvilo gen tts <text> [-o <output>] [--voice <v>] [--speed <s>]\` - Text-to-speech
- \`orvilo gen asr <audioFile> [--model <m>] [--language <l>]\` - Speech-to-text
- \`orvilo gen status <generationId> <asyncTaskId>\` - Check generation task status
- \`orvilo gen download <generationId> <asyncTaskId> [-o <output>]\` - Wait and download result
- \`orvilo gen list\` - List generation topics

## Tips

- Image/video generation is async; use \`status\` or \`download\` to get results
- \`--stream\` for text generation outputs tokens as they arrive
- \`--pipe\` for text generation outputs only the raw text (no formatting)

## Finding Available Video / Image Models

Provider/model management commands (\`orvilo model\`, \`orvilo provider\`) are retired — the
catalog is deployment-owned. Read it through the REST API with a credential your
environment already carries (\`$ORVILO_CLI_API_KEY\`, or \`$ORVILO_JWT\` when it is
exported — note that operation-scoped tokens are only accepted by the model
invocation endpoints, not this one):

\`\`\`bash
TOKEN="\${ORVILO_CLI_API_KEY:-$ORVILO_JWT}"

# List enabled video models for the orvilo provider
curl -s "$ORVILO_SERVER/api/v1/models?provider=orvilo&type=video&enabled=true" \\
  -H "Authorization: Bearer $TOKEN"

# List image generation models
curl -s "$ORVILO_SERVER/api/v1/models?provider=orvilo&type=image&enabled=true" \\
  -H "Authorization: Bearer $TOKEN"
\`\`\`

Use the \`id\` field from the output as the \`-m\` argument. Model IDs for video/image are
**not** the same as human-readable display names — always use the exact \`id\` field.
If no usable credential is in your environment, ask the user for the model ID or
reuse one from \`orvilo agent view\` on an existing agent — never guess slugs.

Example:
\`\`\`bash
# ✅ Correct — use the id from the catalog
orvilo gen video "a cat riding a skateboard" -p orvilo -m dreamina-seedance-2-0-260128

# ❌ Wrong — guessed slugs will fail with no_valid_channel_error
orvilo gen video "a cat riding a skateboard" -p orvilo -m seedance-2.0
\`\`\`

## ⚠️ asyncTaskId vs generationId

\`gen status\` and \`gen download\` require TWO different IDs:

- \`<generationId>\` — prefixed with \`gen_\`, e.g. \`gen_abc123\`
- \`<asyncTaskId>\` — a UUID printed after \`→ Task\` in the \`gen image\` / \`gen video\` output,
  e.g. \`7ad0eb13-e9a5-4403-8070-1f7fe95b2f95\`

Passing \`gen_xxx\` as \`<asyncTaskId>\` will cause a server error. Always use the UUID.

Example output from \`orvilo gen video\`:
\`\`\`
✓ Video generation started
  Batch ID: gb_xxx
  Generation gen_abc123 → Task 7ad0eb13-e9a5-4403-8070-1f7fe95b2f95
                               ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ ← this is asyncTaskId
\`\`\`

Correct usage:
\`\`\`bash
orvilo gen status gen_abc123 7ad0eb13-e9a5-4403-8070-1f7fe95b2f95
orvilo gen download gen_abc123 7ad0eb13-e9a5-4403-8070-1f7fe95b2f95 -o result.mp4
\`\`\`
`;

export default content;
