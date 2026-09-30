import { useRef, useState } from 'react';

import { providerBindingService } from '@/services/providerBinding';
import { useProviderBindingStore } from '@/store/providerBinding';

export interface BindingFeedback {
  message: string;
  tone: 'error' | 'success';
}

/** Captures the mounted account generation, including A → B → A transitions. */
export function useBindingFeedback(generation: number, failureMessage: string) {
  const [feedback, setFeedbackState] = useState<BindingFeedback>();
  const [checking, setChecking] = useState<string>();
  const activeCheck = useRef(false);
  const isCurrent = () => useProviderBindingStore.getState().generation === generation;
  const setFeedback = (message: string, tone: BindingFeedback['tone'] = 'error') =>
    setFeedbackState(message ? { message, tone } : undefined);
  const report = async (operation: () => Promise<unknown>, success: string) => {
    if (!isCurrent()) return false;
    setFeedback('');
    try {
      await operation();
    } catch {
      if (isCurrent()) setFeedback(failureMessage);
      return false;
    }
    if (!isCurrent()) return false;
    setFeedback(success, 'success');
    return true;
  };
  const check = async (id: string, revision: number, success: string) => {
    if (activeCheck.current || !isCurrent()) return;
    activeCheck.current = true;
    setChecking(id);
    try {
      await report(async () => {
        const result = await providerBindingService.checkConnection(id, revision);
        if (result.status !== 'ready') throw new Error('unavailable');
      }, success);
    } finally {
      activeCheck.current = false;
      if (isCurrent()) setChecking(undefined);
    }
  };
  return { feedback, setFeedback, checking, check, isCurrent, report };
}
