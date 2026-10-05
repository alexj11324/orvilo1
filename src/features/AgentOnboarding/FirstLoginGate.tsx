import type { PropsWithChildren } from 'react';
import { Navigate } from 'react-router';

import AsyncError from '@/components/AsyncError';
import { Spinner } from '@/components/ui/spinner';

import { useFirstLoginGate } from './useFirstLoginGate';

/** Enforce the shared onboarding entry even for direct workspace links. */
export default function FirstLoginGate({ children }: PropsWithChildren) {
  const gate = useFirstLoginGate();
  if (gate.status === 'loading') return <Spinner />;
  if (gate.status === 'error')
    return <AsyncError error={gate.error} onRetry={() => void gate.retry()} />;
  if (gate.status === 'redirect') return <Navigate replace to={gate.target} />;
  return children;
}
