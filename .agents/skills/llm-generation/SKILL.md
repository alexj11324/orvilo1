---
name: llm-generation
description: 'Use for auxiliary title/follow-up API generation, prompts and generation tracing. Agent conversation, planning, execution and Reviewer use saved Agent configuration through ACP.'
---

# LLM Generation

The [product contract](../../../docs/development/product-scope.md#8-执行与辅助模型边界) owns the execution/model boundary. Conversation, planning, code execution and Reviewer use configured Agents through ACP; this skill does not authorize Goal/Verify service models or platform model fallbacks.

Title and follow-up suggestion generation use the platform auxiliary model API. Reuse native titles when available; generating a title and writing it back to an external session are separate operations. Orvilo Topic metadata owns storage/display. Trace the actual title-notification/writeback path before blaming an absent title on auxiliary model configuration.

For these auxiliary workflows, keep prompt identity, configured model, structured output and tracing explicit.

## Locate the Existing Boundary

Before editing a call, inspect:

- `packages/prompts` for reusable application prompts;
- `apps/server/src/services/aiGeneration` for the server-side structured generation wrapper;
- `packages/const/src/llmGenerationTracing.ts` for scenario names;
- `packages/llm-generation-tracing` for tracing option and registry behavior;
- the owning service for model configuration and business-specific schemas.

Use `agent-tracing` for execution-snapshot diagnosis and `agent-runtime-hooks` for lifecycle hook behavior. Neither owns application LLM generation conventions.

## Prompt Ownership and Versioning

- Put a reusable generation contract in `packages/prompts/src/chains`: the message builder, JSON schema, schema name, and prompt version should be exported together. Do not leave substantial system prompts or model-facing input serialization embedded in a service.
- Keep execution concerns in the owning server service: model configuration, `AiGenerationService`, tracing entity IDs, Zod validation, persistence, and business error handling do not belong in the prompt chain.
- Keep each `*_PROMPT_VERSION` beside the prompt it versions and export both from the same module.
- Format versions as `v<major>` or `v<major>.<minor>`, for example `v1` or `v1.2`.
- Store only the version in `promptVersion`. Do not include a feature or scenario prefix such as `expertise-ingestion-v1`; `scenario` carries workflow identity.
- Bump the version whenever a prompt or output contract changes in a way that should create a separate evaluation or tracing cohort.

```ts
export const EXAMPLE_PROMPT_VERSION = 'v1';

export const EXAMPLE_SYSTEM_PROMPT = `...`;
```

## Scenario Semantics

Treat `scenario` as the stable product workflow and lifecycle-stage partition, not as a label for a prompt, schema, model, or helper.

- Check `TRACING_SCENARIOS` before adding a call.
- Reuse a scenario only for the same user-visible workflow and lifecycle stage.
- Add a scenario when the business action differs, even if another call shares its prompt or JSON schema. Title generation and follow-up suggestion generation are different scenarios.
- Never borrow a nearby scenario as a placeholder. Doing so contaminates latency, cost, success-rate, and quality data.
- Pass `schemaName` for structured generation and relevant entity IDs when available.

## Model Policy

- Resolve auxiliary model/provider through the platform auxiliary configuration; do not inherit an unrelated chat model or hardcode a probe model.
- Agent execution and Reviewer resolve the saved Agent device/model/native mode through the existing runtime path. Do not add a service-model fallback or use this generation wrapper for planning or review.
- Keep model choice separate from prompt version. Changing a configured model does not rename the prompt or scenario.
- Prefer the shared server generation service when it fits the call so runtime initialization, routing, and tracing remain consistent.

## Structured Generation

- Give each JSON schema a stable, workflow-appropriate name.
- Keep prompt instructions and schema requirements aligned; required fields in one must be supplied by the other.
- Validate generated content at the service boundary and preserve the owning service's fallback/error behavior.
- Do not reuse a schema name to justify reusing an unrelated tracing scenario.

## Verification

For every new or corrected generation workflow:

1. Assert the emitted `scenario`, `promptVersion`, and `schemaName` where applicable.
2. Test the prompt's important behavioral constraints without snapshotting the entire prose.
3. Test structured-output validation and relevant failure behavior.
4. Search for stale inline prompts, old version strings, and incorrectly reused scenarios.
5. Run focused `bun run check <changed-files...>` for code changes. Use remote CI for Typecheck; never run local tsgo. Exercise the affected runtime path when behavior changes, recording revision and effective saved Agent configuration where applicable.

Use the `testing` skill for test mechanics and the `typescript` skill for TypeScript changes.
