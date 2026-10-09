'use client';
import { isDesktop } from '@orvilo/const';
import { formatAbsoluteDate, formatAbsoluteDateTime } from '@orvilo/utils/time';
import { useMutation } from '@tanstack/react-query';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { BookOpen, Eye, MoreHorizontal, Trash } from 'lucide-react';
import { type FC, useState } from 'react';
import { useTranslation } from 'react-i18next';
import urlJoin from 'url-join';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { type LiteTableColumn } from '@/components/LiteTable';
import LiteTable from '@/components/LiteTable';
import { confirmModal } from '@/components/Modal';
import { Badge } from '@/components/reui/badge';
import { toast } from '@/components/toast';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { isFullAccessApiKey } from '@/const/apiKeyScope';
import { usePermission } from '@/hooks/usePermission';
import { useClientDataSWR } from '@/libs/swr';
import { apiKeyKeys } from '@/libs/swr/keys';
import { lambdaClient } from '@/libs/trpc/client';
import { useElectronStore } from '@/store/electron';
import { electronSyncSelectors } from '@/store/electron/selectors';
import { type ApiKeyItem, type CreateApiKeyParams, type UpdateApiKeyParams } from '@/types/apiKey';
import { isForbiddenError } from '@/utils/forbiddenError';

import { useWorkspaceApiKeyPolicy } from '../WorkspaceApiKeyPolicyContext';
import ApiKeyDetail from './ApiKeyDetail';
import { ApiKeyDisplay, createApiKeyModal } from './index';

dayjs.extend(relativeTime);

const isExpired = (apiKey: ApiKeyItem) =>
  !!apiKey.expiresAt && dayjs(apiKey.expiresAt).isBefore(dayjs());

const ApiKey: FC = () => {
  const { t } = useTranslation('auth');
  const { t: tc } = useTranslation('common');
  const activeWorkspaceId = useActiveWorkspaceId();
  const workspacePolicy = useWorkspaceApiKeyPolicy();

  const { allowed: canEdit, reason } = usePermission('create_content');
  // Desktop renders from app://renderer, where a relative href is denied by the
  // window-open handler — resolve the docs link against the active server origin.
  const remoteServerUrl = useElectronStore(electronSyncSelectors.remoteServerUrl);
  const docsHref = isDesktop ? urlJoin(remoteServerUrl, '/api/v1/docs') : '/api/v1/docs';
  const canCreate = canEdit && (!activeWorkspaceId || workspacePolicy.canCreate);
  const isMemberCreationRestricted =
    !!activeWorkspaceId && !workspacePolicy.isAdmin && !workspacePolicy.canCreate;
  const manageTooltip = tc(
    'manageOnlyCreator',
    'Only the creator or a workspace owner can do this',
  );
  const createTooltip = workspacePolicy.canCreate
    ? reason
    : t('apikey.list.actions.creationRestricted');

  const { data, isLoading, mutate } = useClientDataSWR<ApiKeyItem[]>(apiKeyKeys.list(), () =>
    lambdaClient.apiKey.getApiKeys.query(),
  );

  // Detail drawer holds only the id; the item is re-derived from SWR data so
  // in-drawer edits (rename / toggle) reflect immediately after revalidation.
  const [detailId, setDetailId] = useState<string>();
  const detailApiKey = detailId ? data?.find((item) => item.id === detailId) : undefined;

  const notifyMutationError = (error: unknown) => {
    toast.error(
      isForbiddenError(error)
        ? manageTooltip
        : tc('operationFailed', 'Operation failed, please try again'),
    );
  };

  const createMutation = useMutation({
    mutationFn: (params: CreateApiKeyParams) => lambdaClient.apiKey.createApiKey.mutate(params),
    onError: notifyMutationError,
    onSuccess: () => {
      mutate();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, params }: { id: string; params: UpdateApiKeyParams }) =>
      lambdaClient.apiKey.updateApiKey.mutate({ id, value: params }),
    onError: notifyMutationError,
    onSuccess: () => {
      mutate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => lambdaClient.apiKey.deleteApiKey.mutate({ id }),
    onError: notifyMutationError,
    onSuccess: () => {
      mutate();
    },
  });

  const handleCreate = () => {
    if (!canCreate) return;
    createApiKeyModal({
      onSubmit: async (values) => createMutation.mutateAsync(values),
    });
  };

  const confirmDelete = (apiKey: ApiKeyItem) => {
    confirmModal({
      cancelText: t('apikey.list.actions.deleteConfirm.actions.cancel'),
      content: t('apikey.list.actions.deleteConfirm.content'),
      okButtonProps: { danger: true },
      okText: t('apikey.list.actions.deleteConfirm.actions.ok'),
      onOk: async () => {
        await deleteMutation.mutateAsync(apiKey.id);
      },
      title: t('apikey.list.actions.deleteConfirm.title'),
    });
  };

  const canDeleteRow = (apiKey: ApiKeyItem) =>
    canEdit && (apiKey.isMine !== false || workspacePolicy.isAdmin);

  const columns: LiteTableColumn<ApiKeyItem>[] = [
    {
      key: 'name',
      listSlot: 'title',
      // The name is the affordance into the detail drawer — styled as a link so
      // the row reads as navigable rather than inert.
      render: (apiKey) => (
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{apiKey.name}</span>
          {apiKey.enabled === false && (
            <Badge variant="outline">{t('apikey.status.disabled')}</Badge>
          )}
        </div>
      ),
      title: t('apikey.list.columns.name'),
    },
    {
      key: 'key',
      render: (apiKey) => (
        // Plaintext is returned only for the caller's own keys; other members'
        // rows are masked (owners can manage them but never see the secret).
        <span onClick={(e) => e.stopPropagation()}>
          {apiKey.isMine === false ? (
            <span style={{ opacity: 0.5 }}>{`sk-ov-${'*'.repeat(12)}`}</span>
          ) : apiKey.keyDecryptionFailed ? (
            <span title={t('apikey.display.unavailableDescription')}>
              {t('apikey.display.unavailable')}
            </span>
          ) : (
            <ApiKeyDisplay apiKey={apiKey.key} />
          )}
        </span>
      ),
      title: t('apikey.list.columns.key'),
      width: 220,
    },
    // A count summary can't truncate, so scopes earn a list column; the full
    // grant list still lives in the detail drawer (row click).
    {
      key: 'scopes',
      render: (apiKey) => (
        <Badge variant="outline">
          {isFullAccessApiKey(apiKey.scopes)
            ? t('apikey.scopes.fullAccess')
            : t('apikey.scopes.count', { count: apiKey.scopes?.length ?? 0 })}
        </Badge>
      ),
      title: t('apikey.list.columns.scopes'),
      width: 110,
    },
    ...(activeWorkspaceId && workspacePolicy.isAdmin
      ? [
          {
            key: 'creator',
            render: (apiKey: ApiKeyItem) => apiKey.creator || '-',
            title: t('apikey.list.columns.creator'),
            width: 140,
          } satisfies LiteTableColumn<ApiKeyItem>,
        ]
      : []),
    {
      key: 'expiresAt',
      render: (apiKey) =>
        apiKey.expiresAt ? (
          <span
            className={isExpired(apiKey) ? 'text-destructive' : undefined}
            title={formatAbsoluteDateTime(apiKey.expiresAt)}
          >
            {isExpired(apiKey) ? t('apikey.status.expired') : formatAbsoluteDate(apiKey.expiresAt)}
          </span>
        ) : (
          <span className="text-muted-foreground">{t('apikey.display.neverExpires')}</span>
        ),
      title: t('apikey.list.columns.expiresAt'),
      width: 130,
    },
    {
      key: 'lastUsedAt',
      render: (apiKey: ApiKeyItem) =>
        apiKey.lastUsedAt ? (
          // Relative time answers "is this key still in use?" at a glance; the
          // exact timestamp stays one hover away.
          <span title={formatAbsoluteDateTime(apiKey.lastUsedAt)}>
            {dayjs(apiKey.lastUsedAt).fromNow()}
          </span>
        ) : (
          <span className="text-muted-foreground">{t('apikey.display.neverUsed')}</span>
        ),
      title: t('apikey.list.columns.lastUsedAt'),
    },
    // Browse actions stay on the row (Vercel-token style); the drawer remains
    // the full management surface for rename / expiry / scopes. In the narrow
    // card layout the menu sits beside the name (`extra`), not under the meta.
    {
      key: 'actions',
      listSlot: 'extra',
      render: (apiKey) => (
        <span onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button aria-label={t('apikey.list.actions.more')} size="icon-sm" variant="ghost" />
              }
            >
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setDetailId(apiKey.id)}>
                <Eye />
                {t('apikey.list.actions.viewDetails')}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!canDeleteRow(apiKey)}
                variant="destructive"
                onClick={() => confirmDelete(apiKey)}
              >
                <Trash />
                {t('apikey.list.actions.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      ),
      title: '',
      width: 48,
    },
  ];

  return (
    <div className="overflow-hidden rounded-(--radius-card) bg-card py-4">
      <div className="flex items-start justify-between gap-4 px-6 pb-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm" style={{ fontSize: 16, fontWeight: 500, margin: 0 }}>
            {t('apikey.list.title')}
          </span>
          <span className="text-sm text-muted-foreground" style={{ fontSize: 13 }}>
            {t('apikey.list.desc')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a
            className={buttonVariants({ variant: 'ghost' })}
            href={docsHref}
            rel="noopener noreferrer"
            target="_blank"
          >
            <BookOpen />
            {t('apikey.list.actions.viewDocs')}
          </a>
          <Button
            disabled={!canCreate}
            size="lg"
            title={canCreate ? undefined : createTooltip}
            type="button"
            onClick={handleCreate}
          >
            {t('apikey.list.actions.create')}
          </Button>
        </div>
      </div>
      <LiteTable
        columns={columns}
        dataSource={data}
        loading={isLoading}
        rowKey={(apiKey) => apiKey.id}
        emptyText={
          <div className="flex min-h-60 w-full items-center justify-center">
            <div className="flex min-h-40 flex-col items-center justify-center gap-2 py-12 text-center text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                {isMemberCreationRestricted ? t('apikey.list.restrictedEmpty.title') : undefined}
              </span>
              {t(
                isMemberCreationRestricted
                  ? 'apikey.list.restrictedEmpty.desc'
                  : 'apikey.list.empty',
              )}
            </div>
          </div>
        }
        onRowClick={(apiKey) => setDetailId(apiKey.id)}
      />
      <ApiKeyDetail
        apiKey={detailApiKey}
        canDelete={canEdit && !!detailApiKey && canDeleteRow(detailApiKey)}
        canEdit={canEdit && !!detailApiKey && detailApiKey.isMine !== false}
        manageTooltip={canEdit ? manageTooltip : (reason ?? manageTooltip)}
        open={!!detailApiKey}
        onClose={() => setDetailId(undefined)}
        onDelete={async (id) => {
          await deleteMutation.mutateAsync(id);
          setDetailId(undefined);
        }}
        onUpdate={async (id, params) => {
          try {
            await updateMutation.mutateAsync({ id, params });
            return true;
          } catch {
            return false;
          }
        }}
      />
    </div>
  );
};

export default ApiKey;
