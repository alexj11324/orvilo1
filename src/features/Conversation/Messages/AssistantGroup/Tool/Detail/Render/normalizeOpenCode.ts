const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

/** ACP updates carry the final input separately from the initial tool-call arguments. */
export const normalizeOpenCodeRender = (args: unknown, state: unknown, apiName?: string) => {
  const pluginState = record(state);
  const input = { ...record(args), ...record(pluginState?.rawInput) };
  return {
    args: input,
    pluginState:
      apiName === 'read' && pluginState
        ? {
            ...pluginState,
            content: typeof pluginState.content === 'string' ? pluginState.content : undefined,
          }
        : pluginState,
  };
};
