/**
 * Producer-side MCP server the desktop exposes to external CLI agents (CC).
 * One process-wide HTTP server, per-op routing via `?op=<opId>`; hosts the
 * built-in tool surface: `ask_user_question` (AskUserQuestion replacement)
 * plus any producer-mounted extra tools (e.g. in-app browser control).
 */
export {
  type McpExtraTool,
  type McpToolResult,
  OrviloBuiltinMcpServer,
  type OrviloBuiltinMcpServerOptions,
  type StartedServer,
} from './OrviloBuiltinMcpServer';
