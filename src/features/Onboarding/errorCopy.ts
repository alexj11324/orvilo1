import { normalizeAsyncError } from '@/libs/swr/normalizeError';

/** The onboarding action that failed, so the error can name what the user was doing. */
export type OnboardingAction = 'workspace' | 'agent' | 'selection' | 'finish' | 'skip';

type CopyAction = Exclude<OnboardingAction, 'skip'>;

export interface OnboardingErrorCopy {
  descriptionKey: `setup.error.${CopyAction}.description`;
  titleKey: `setup.error.${CopyAction}.title`;
}

/**
 * Map a failed onboarding action to its copy keys. Auth failures (401/403) return
 * `undefined` so the shared error component keeps its sign-in / forbidden copy
 * and recovery action instead of an unrelated "try again".
 */
export const resolveOnboardingErrorCopy = (
  action: OnboardingAction,
  error: unknown,
): OnboardingErrorCopy | undefined => {
  const { status } = normalizeAsyncError(error);
  if (status === 401 || status === 403) return undefined;
  // Skipping finishes onboarding, so a failed skip reads as a failed finish.
  const copyAction: CopyAction = action === 'skip' ? 'finish' : action;
  return {
    descriptionKey: `setup.error.${copyAction}.description`,
    titleKey: `setup.error.${copyAction}.title`,
  };
};
