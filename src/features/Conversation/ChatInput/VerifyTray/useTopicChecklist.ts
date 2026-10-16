import { useCallback } from 'react';

import { useClientDataSWR } from '@/libs/swr';
import { verifyKeys } from '@/libs/swr/keys';
// Workspace-aware mutate: applies the same `augmentKey` treatment
// useClientDataSWR uses on its keys, so a mutate here actually matches the
// tray's subscription (a raw `swr` mutate would miss the augmented key).
import { verifyService } from '@/services/verify';

import type { TrayCheck } from './types';

const genId = () => `chk_${Math.random().toString(36).slice(2, 10)}`;

/**
 * A topic's acceptance state: the one-sentence Goal (the outcome the
 * conversation is delivering, stored as `acceptance.requirement`) and the
 * tracking checks under it (`config.checklist`).
 */
interface TopicGoal {
  checks: TrayCheck[];
  goal: string;
}

const EMPTY: TopicGoal = { checks: [], goal: '' };

const swrKey = (topicId: string) =>
  verifyKeys.acceptanceBySubject('topic', topicId) as unknown as string;

const read = async (topicId: string): Promise<TopicGoal> => {
  const acceptance = await verifyService.getAcceptanceBySubject('topic', topicId);
  return {
    checks: (acceptance?.config?.checklist ?? []).map((c) => ({
      id: c.id,
      method: c.method ?? '',
      name: c.name,
    })),
    goal: acceptance?.requirement ?? '',
  };
};

const persistChecks = async (_topicId: string, _goal: string, _checks: TrayCheck[]) => {
  throw new Error('Standalone Acceptance is read-only. Use the Issue Checklist.');
};
const persistGoal = async (_topicId: string, _goal: string, _checks: TrayCheck[]) => {
  throw new Error('Standalone Acceptance is read-only. Use the Issue Checklist.');
};

/**
 * The topic's Goal + tracking checks, persisted on the verify aggregate — not
 * client storage. Reads via SWR; mutations write through the acceptance router
 * and revalidate.
 */
export const useTopicGoal = (topicId: string | undefined) => {
  const { data, isLoading } = useClientDataSWR(topicId ? swrKey(topicId) : null, () =>
    read(topicId!),
  );
  const { checks, goal } = data ?? EMPTY;

  const setGoal = useCallback(
    (next: string) => {
      if (!topicId) return;
      return persistGoal(topicId, next, checks);
    },
    [topicId, checks],
  );

  const addCheck = useCallback(
    (item: { method: string; name: string }) => {
      if (!topicId) return;
      return persistChecks(topicId, goal, [...checks, { ...item, id: genId() }]);
    },
    [topicId, goal, checks],
  );

  const updateCheck = useCallback(
    (id: string, patch: Partial<Omit<TrayCheck, 'id'>>) => {
      if (!topicId) return;
      return persistChecks(
        topicId,
        goal,
        checks.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      );
    },
    [topicId, goal, checks],
  );

  const removeCheck = useCallback(
    (id: string) => {
      if (!topicId) return;
      return persistChecks(
        topicId,
        goal,
        checks.filter((c) => c.id !== id),
      );
    },
    [topicId, goal, checks],
  );

  return { addCheck, checks, goal, isLoading, removeCheck, setGoal, updateCheck };
};
