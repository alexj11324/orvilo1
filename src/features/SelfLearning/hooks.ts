import { useClientDataSWR } from '@/libs/swr';
import { swrKeys } from '@/libs/swr/keys';
import { expertiseService } from '@/services/expertise';

/**
 * The agent's rules, in one query. `refreshInterval` is left unused since S60 removed the
 * history warm-up that used to drive it; the parameter stays for a caller that needs to poll.
 */
export const useExpertiseOverview = (agentId?: string, refreshInterval?: number) =>
  useClientDataSWR(
    agentId ? swrKeys.expertise.overview(agentId) : null,
    () => expertiseService.listByAgent(agentId!),
    { refreshInterval },
  );

export const useExpertiseDomain = (domainId?: string) =>
  useClientDataSWR(domainId ? swrKeys.expertise.domain(domainId) : null, () =>
    expertiseService.getDomain(domainId!),
  );

export const useExpertiseLesson = (lessonId?: string) =>
  useClientDataSWR(lessonId ? swrKeys.expertise.lesson(lessonId) : null, () =>
    expertiseService.getLesson(lessonId!),
  );
