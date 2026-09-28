/**
 * OTel GenAI Semantic Convention attribute names used by the Agent Runtime
 * instrumentation, alongside Orvilo-specific (`orvilo.*`) extensions.
 *
 * Aligned with OTel GenAI Semantic Conventions v1.41:
 * https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans/
 *
 * Attribute names that already live in our generated `gen-ai/semconv.ts` copy
 * are re-exported here instead of being re-declared, keeping that generated
 * file as the source of truth.
 */

// ---- gen_ai.* (generated OTel semconv copy) ----

export {
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_REQUEST_MAX_TOKENS,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_REQUEST_TEMPERATURE,
  ATTR_GEN_AI_REQUEST_TOP_P,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_RESPONSE_ID,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
} from '../../gen-ai/semconv';

// ---- gen_ai.* (OTel spec, not yet in the generated local copy) ----

/** Provider name — `openai`, `anthropic`, `orvilo`, etc. */
export const ATTR_GEN_AI_PROVIDER_NAME = 'gen_ai.provider.name' as const;

/** Conversation / topic id this span belongs to. */
export const ATTR_GEN_AI_CONVERSATION_ID = 'gen_ai.conversation.id' as const;

/** Whether the request was issued in streaming mode. */
export const ATTR_GEN_AI_REQUEST_STREAM = 'gen_ai.request.stream' as const;

/** Time to first chunk for streaming responses (TTFT), recorded in seconds. */
export const ATTR_GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK =
  'gen_ai.response.time_to_first_chunk' as const;

/** Cache-hit input tokens. */
export const ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS =
  'gen_ai.usage.cache_read.input_tokens' as const;

/** Reasoning output tokens (thinking). */
export const ATTR_GEN_AI_USAGE_REASONING_OUTPUT_TOKENS =
  'gen_ai.usage.reasoning.output_tokens' as const;

/** Agent identity. */
export const ATTR_GEN_AI_AGENT_ID = 'gen_ai.agent.id' as const;
export const ATTR_GEN_AI_AGENT_NAME = 'gen_ai.agent.name' as const;
export const ATTR_GEN_AI_AGENT_DESCRIPTION = 'gen_ai.agent.description' as const;
export const ATTR_GEN_AI_AGENT_VERSION = 'gen_ai.agent.version' as const;
export const ATTR_GEN_AI_DATA_SOURCE_ID = 'gen_ai.data_source.id' as const;

/** Tool span attributes. */
export const ATTR_GEN_AI_TOOL_NAME = 'gen_ai.tool.name' as const;
export const ATTR_GEN_AI_TOOL_TYPE = 'gen_ai.tool.type' as const;
export const ATTR_GEN_AI_TOOL_DESCRIPTION = 'gen_ai.tool.description' as const;
export const ATTR_GEN_AI_TOOL_CALL_ID = 'gen_ai.tool.call.id' as const;
export const ATTR_GEN_AI_TOOL_CALL_ARGUMENTS = 'gen_ai.tool.call.arguments' as const;
export const ATTR_GEN_AI_TOOL_CALL_RESULT = 'gen_ai.tool.call.result' as const;

// ---- orvilo.* (Orvilo-specific extensions) ----

/** Internal operation id assigned by the Agent Runtime. */
export const ATTR_ORVILO_AGENT_OPERATION_ID = 'orvilo.agent.operation.id' as const;

/** Total step count for the agent invocation. */
export const ATTR_ORVILO_AGENT_STEP_COUNT = 'orvilo.agent.step.count' as const;

/** Current step index within the agent invocation. */
export const ATTR_ORVILO_AGENT_STEP_INDEX = 'orvilo.agent.step.index' as const;

/** Completion reason: `done` / `error` / `max_steps` / `cost_limit` / `interrupted` / `waiting_for_human`. */
export const ATTR_ORVILO_AGENT_COMPLETION_REASON = 'orvilo.agent.completion_reason' as const;

/** Tool execution success flag (gen_ai spec uses error.type for failures only). */
export const ATTR_ORVILO_TOOL_SUCCESS = 'orvilo.tool.success' as const;

/** Attempts taken to execute a tool (1 for first-try success). */
export const ATTR_ORVILO_TOOL_ATTEMPTS = 'orvilo.tool.attempts' as const;

/** Internal Orvilo tool source (`builtin` / `client` / `mcp` / `composio` / `orviloSkill`). */
export const ATTR_ORVILO_TOOL_SOURCE = 'orvilo.tool.source' as const;

/** Context engineering metadata. */
export const ATTR_ORVILO_CONTEXT_MESSAGE_COUNT = 'orvilo.context.message_count' as const;
export const ATTR_ORVILO_CONTEXT_TOKEN_USAGE = 'orvilo.context.token_usage' as const;
export const ATTR_ORVILO_CONTEXT_WINDOW_RATIO = 'orvilo.context.window_ratio' as const;
export const ATTR_ORVILO_CONTEXT_KNOWLEDGE_INJECTED = 'orvilo.context.knowledge_injected' as const;
export const ATTR_ORVILO_CONTEXT_KNOWLEDGE_COUNT = 'orvilo.context.knowledge_count' as const;
export const ATTR_ORVILO_CONTEXT_HISTORY_COMPRESSED = 'orvilo.context.history_compressed' as const;
export const ATTR_ORVILO_CONTEXT_MEMORY_INJECTED = 'orvilo.context.memory_injected' as const;
export const ATTR_ORVILO_CONTEXT_SYSTEM_ROLE_LENGTH = 'orvilo.context.system_role_length' as const;
export const ATTR_ORVILO_CONTEXT_TOOL_COUNT = 'orvilo.context.tool_count' as const;
export const ATTR_ORVILO_CONTEXT_HAS_IMAGES = 'orvilo.context.has_images' as const;

// ---- Fixed operation.name values ----

export const GEN_AI_OPERATION_CHAT = 'chat' as const;
export const GEN_AI_OPERATION_INVOKE_AGENT = 'invoke_agent' as const;
export const GEN_AI_OPERATION_EXECUTE_TOOL = 'execute_tool' as const;
