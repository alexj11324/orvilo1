type ClerkErrorItem = {
  code?: string;
  longMessage?: string;
  message?: string;
};

type ClerkErrorShape = {
  errors?: ClerkErrorItem[];
  longMessage?: string;
  message?: string;
};

const asClerkError = (value: unknown): ClerkErrorShape | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const errors = Array.isArray(candidate.errors)
    ? candidate.errors.filter(
        (item): item is ClerkErrorItem => Boolean(item) && typeof item === 'object',
      )
    : undefined;
  return {
    errors,
    longMessage: typeof candidate.longMessage === 'string' ? candidate.longMessage : undefined,
    message: typeof candidate.message === 'string' ? candidate.message : undefined,
  };
};

export const clerkErrorMessage = (value: unknown, fallback: string): string => {
  const error = asClerkError(value);
  const first = error?.errors?.find((item) => item.longMessage || item.message);
  const message =
    first?.longMessage ??
    first?.message ??
    error?.longMessage ??
    error?.message ??
    (value instanceof Error ? value.message : '');
  return message || fallback;
};

export const clerkErrorCode = (value: unknown): string | null =>
  asClerkError(value)?.errors?.find((item) => item.code)?.code ?? null;
