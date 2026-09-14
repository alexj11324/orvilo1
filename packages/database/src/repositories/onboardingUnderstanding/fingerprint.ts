import type { OnboardingUnderstandingSession } from '@orvilo/types';

export const getUnderstandingSourceFingerprint = (session: OnboardingUnderstandingSession) =>
  Object.entries(session.sources)
    .filter(([, source]) => source.status === 'completed')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([providerId, source]) => `${providerId}@${source.revision}`)
    .join(',');
