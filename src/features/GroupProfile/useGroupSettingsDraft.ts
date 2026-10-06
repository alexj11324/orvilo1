import type { AgentItem } from '@orvilo/types';
import { useDeepCompareEffect } from 'ahooks';
import { useState } from 'react';

import type { AgentRuntimeConfig } from '@/features/CreateAgent';

export const useGroupSettingsDraft = (
  coordinator: Pick<AgentItem, 'agencyConfig' | 'model' | 'provider' | 'systemRole'> | undefined,
  openingMessage?: string,
  openingQuestions?: string[],
) => {
  const [runtime, setRuntime] = useState<AgentRuntimeConfig>();
  const [prompt, setPrompt] = useState('');
  const [opening, setOpening] = useState('');
  const [questions, setQuestions] = useState('');

  useDeepCompareEffect(() => {
    setRuntime(
      coordinator
        ? {
            agencyConfig: coordinator.agencyConfig ?? undefined,
            model: coordinator.model,
            provider: coordinator.provider,
          }
        : undefined,
    );
    setPrompt(coordinator?.systemRole ?? '');
  }, [
    coordinator?.agencyConfig,
    coordinator?.model,
    coordinator?.provider,
    coordinator?.systemRole,
  ]);

  useDeepCompareEffect(() => {
    setOpening(openingMessage ?? '');
    setQuestions(openingQuestions?.join('\n') ?? '');
  }, [openingMessage, openingQuestions]);

  return { runtime, setRuntime, prompt, setPrompt, opening, setOpening, questions, setQuestions };
};
