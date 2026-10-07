/** Preserve the runtime's advertised name; an unknown model remains its full opaque ID. */
export const modelDisplayLabel = (model: { id: string; label?: string; modelId: string }): string =>
  model.label || model.modelId || model.id;
