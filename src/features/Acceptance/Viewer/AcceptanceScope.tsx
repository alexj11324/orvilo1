'use client';

import { createContext, type ReactNode, use } from 'react';
import { useTranslation } from 'react-i18next';

import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';
import { isTrpcErrorCode } from '@/utils/trpcError';

import { useAcceptanceBundle } from './useAcceptanceBundle';

type AcceptanceScopeValue = {
  acceptanceId: string;
  embedded: boolean;
};

const AcceptanceScopeContext = createContext<AcceptanceScopeValue | null>(null);

export const useAcceptanceScope = () => {
  const scope = use(AcceptanceScopeContext);
  if (!scope) throw new Error('AcceptanceScope is required');
  return scope;
};

/** For leaves that may also render outside the viewer (no scope → no collaboration UI). */
export const useOptionalAcceptanceScope = () => use(AcceptanceScopeContext);

export const AcceptanceScope = ({
  acceptanceId,
  children,
  embedded = false,
}: {
  acceptanceId: string;
  children: ReactNode;
  embedded?: boolean;
}) => (
  <AcceptanceScopeContext value={{ acceptanceId, embedded }}>{children}</AcceptanceScopeContext>
);

export const AcceptanceBundleGate = ({
  children,
  height = '100%',
}: {
  children: ReactNode;
  height?: string | number;
}) => {
  const { t } = useTranslation('verify');
  const { acceptanceId } = useAcceptanceScope();
  const { data, error, isLoading, mutate } = useAcceptanceBundle(acceptanceId);

  if (isLoading && !data) {
    return (
      <div className="flex flex-col items-center justify-center" style={{ height }}>
        <NeuralNetworkLoading size={48} />
      </div>
    );
  }

  /**
   * A deleted acceptance and one that was never shared with this reader answer
   * the same way — NOT_FOUND, so a link cannot be used to probe for what
   * exists. Either way it will not appear by trying again, so it says so
   * instead of blaming the network and offering a retry that cannot work.
   */
  if (!data && isTrpcErrorCode(error, 'NOT_FOUND')) {
    return (
      <div className="flex flex-col items-center justify-center" style={{ height }}>
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t('acceptance.notFound.title')}</EmptyTitle>
            <EmptyDescription>{t('acceptance.notFound.description')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center" style={{ height }}>
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t('acceptance.error.title')}</EmptyTitle>
            <EmptyDescription>{t('acceptance.error.description')}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => void mutate()}>{t('report.actions.retry')}</Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return children;
};
