import { useRef, useState } from 'react';

import type { CreateAgentParams } from '@/services/agent';
import {
  createOnboardingAgentOnce,
  type FirstAgentCreationCheckpoint,
} from '@/services/agentOnboarding';

type CreatedAgent = Awaited<ReturnType<typeof createOnboardingAgentOnce>>;

/** Reconcile a lost response before retrying, while keeping a refused draft editable. */
export const useAgentCreation = ({
  checkpoint: suppliedCheckpoint,
  createAgent,
  prepare,
  ready,
  onCreated,
}: {
  checkpoint?: FirstAgentCreationCheckpoint;
  createAgent: Parameters<typeof createOnboardingAgentOnce>[2];
  onCreated?: (result: CreatedAgent) => void | Promise<void>;
  prepare: () => Promise<CreateAgentParams>;
  ready: boolean;
}) => {
  const checkpoint = useRef(suppliedCheckpoint ?? { requestId: crypto.randomUUID() });
  const saved = useRef<CreatedAgent | undefined>(undefined);
  const submitting = useRef(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<unknown>();
  const submit = async () => {
    if (submitting.current || (!saved.current && !ready)) return;
    submitting.current = true;
    setCreating(true);
    setError(undefined);
    try {
      if (!saved.current) {
        const draft = await prepare();
        saved.current = await createOnboardingAgentOnce(checkpoint.current, draft, createAgent);
      }
      await onCreated?.(saved.current);
    } catch (cause) {
      setError(cause);
    } finally {
      submitting.current = false;
      setCreating(false);
    }
  };
  return {
    creating,
    error,
    locked: creating || !!saved.current,
    hasSavedAgent: !!saved.current,
    submit,
  };
};
