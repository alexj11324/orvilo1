'use client';

import { type OwnCredSummary } from '@orvilo/types';
import { useMutation } from '@tanstack/react-query';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncBoundary from '@/components/AsyncBoundary';
import ListSkeleton from '@/components/ListSkeleton';
import { usePermission } from '@/hooks/usePermission';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import { credsApiForRow, isActionableCredRow } from './credAccess';
import CredItem from './CredItem';
import { createEditCredModal } from './EditCredModal';
import { defaultCredsApi, useCredsApi } from './useCredsApi';
import { createViewCredModal } from './ViewCredModal';

const CredsList: FC = () => {
  const { t } = useTranslation('setting');
  const { allowed: canManageCredentials } = usePermission('manage_provider_key');
  const credsApi = useCredsApi();
  const myUserId = useUserStore(userProfileSelectors.userId);

  const { data, error, isLoading, refetch } = credsApi.query.list.useQuery(undefined);

  const credentials = data?.data ?? [];

  // See credAccess.ts for the ownership/routing rules this applies.
  const isActionable = (cred: OwnCredSummary) => isActionableCredRow(cred, myUserId);
  const apiFor = (cred: OwnCredSummary) =>
    credsApiForRow(cred, myUserId, credsApi, defaultCredsApi);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!canManageCredentials) return;
      const cred = credentials.find((c) => c.id === id);
      if (!cred || !isActionable(cred)) return;
      await apiFor(cred).client.delete.mutate({ id });
    },
    onSuccess: () => {
      refetch();
    },
  });

  const handleEdit = (cred: OwnCredSummary) => {
    if (!isActionable(cred)) return;
    createEditCredModal({
      cred,
      credsApi: apiFor(cred),
      onSuccess: () => refetch(),
    });
  };

  const handleView = (cred: OwnCredSummary) => {
    if (!isActionable(cred)) return;
    createViewCredModal({ cred, credsApi: apiFor(cred) });
  };

  return (
    <div className="flex flex-col gap-2">
      <AsyncBoundary
        data={data}
        error={error}
        errorVariant={'block'}
        isEmpty={credentials.length === 0}
        isLoading={isLoading}
        loading={<ListSkeleton paddingInline={0} />}
        empty={
          <div className="flex min-h-40 flex-col items-center justify-center gap-2 py-12 text-center text-sm text-muted-foreground">
            {t('creds.empty')}
          </div>
        }
        onRetry={() => refetch()}
      >
        <div>
          {credentials.map((cred) => {
            // Another member's shared row: no endpoint this UI can reach for
            // it (see the isActionable doc comment above) — omit the action
            // handlers entirely so CredItem renders the row with no "..."
            // menu / view button, instead of a menu whose actions silently
            // no-op.
            const actionable = isActionable(cred);
            return (
              <CredItem
                cred={cred}
                key={cred.id}
                onDelete={actionable ? (id) => deleteMutation.mutate(id) : undefined}
                onEdit={actionable && canManageCredentials ? (cred) => handleEdit(cred) : undefined}
                onView={actionable ? handleView : undefined}
              />
            );
          })}
        </div>
      </AsyncBoundary>
    </div>
  );
};

export default CredsList;
