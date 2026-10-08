import type { AgentItem } from '@orvilo/types';
import { isEqual } from 'es-toolkit';

import type { AgentRuntimeConfig } from '@/features/CreateAgent';

interface OpeningDraft {
  opening: string;
  openingMessage?: string;
  openingQuestions?: string[];
  questions: string;
}

/** The opening message/questions drafts differ from what the group stores. */
export const isOpeningDirty = ({
  opening,
  openingMessage,
  openingQuestions,
  questions,
}: OpeningDraft): boolean =>
  opening !== (openingMessage ?? '') || questions !== (openingQuestions?.join('\n') ?? '');

interface CoordinatorDraft {
  coordinator?: Pick<AgentItem, 'agencyConfig' | 'model' | 'provider' | 'systemRole'> & {
    params?: { orchestratorSourceAgentId?: string } | null;
  };
  prompt: string;
  runtime?: AgentRuntimeConfig;
  selectedOrchestratorId?: string;
}

/** The coordinator drafts (prompt, engine, orchestrator) differ from the stored coordinator. */
export const isCoordinatorDirty = ({
  coordinator,
  prompt,
  runtime,
  selectedOrchestratorId,
}: CoordinatorDraft): boolean => {
  if (!coordinator || !runtime) return false;

  return (
    prompt !== (coordinator.systemRole ?? '') ||
    runtime.model !== coordinator.model ||
    runtime.provider !== coordinator.provider ||
    !isEqual(runtime.agencyConfig ?? undefined, coordinator.agencyConfig ?? undefined) ||
    (selectedOrchestratorId ?? undefined) !==
      (coordinator.params?.orchestratorSourceAgentId ?? undefined)
  );
};
