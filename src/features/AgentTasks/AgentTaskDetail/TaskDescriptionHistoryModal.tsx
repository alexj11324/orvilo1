import { Markdown } from '@lobehub/ui';
import isEqual from 'fast-deep-equal';
import { t as translate } from 'i18next';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuthorInfo } from '@/business/client/hooks/useAuthorInfo';
import AsyncError from '@/components/AsyncError';
import { createModal, useModalContext } from '@/components/Modal';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useClientDataSWR } from '@/libs/swr';
import { taskMenuService } from '@/services/taskMenu';
import { useTaskStore } from '@/store/task';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';
import { trpcErrorMessage } from '@/utils/trpcError';

interface HistoryModalProps {
  canEdit: boolean;
  identifier: string;
  onChanged: () => Promise<void>;
  taskId: string;
}
type HistoryRow = Awaited<
  ReturnType<typeof taskMenuService.descriptionHistory>
>['data']['versions'][number];

const HistoryAuthor = ({ userId }: { userId?: string | null }) => {
  const { t } = useTranslation('chat');
  const author = useAuthorInfo(userId ?? undefined);
  const currentUserId = useUserStore(userProfileSelectors.userId);
  const currentUserName = useUserStore(userProfileSelectors.displayUserName);
  return (
    <span>
      {author?.fullName ??
        (userId && userId === currentUserId
          ? currentUserName || t('you')
          : t('taskDetail.menu.authorUnavailable'))}
    </span>
  );
};

/**
 * Captured description versions, newest first. Only versions the server
 * recorded are listed — nothing is reconstructed from the current text — and
 * restoring one is a revision-checked write.
 */
const TaskDescriptionHistory = ({ taskId, canEdit, onChanged }: HistoryModalProps) => {
  const { t } = useTranslation(['chat', 'common']);
  const { close } = useModalContext();
  const { data, error, isLoading, mutate } = useClientDataSWR(
    ['task:descriptionHistory', taskId],
    () => taskMenuService.descriptionHistory({ id: taskId, limit: 50 }),
  );
  const [index, setIndex] = useState(0);
  const [older, setOlder] = useState<HistoryRow[]>([]);
  const [more, setMore] = useState(true);
  const [pending, setPending] = useState(false);
  const [mutationError, setMutationError] = useState<string>();
  const current = data?.data.current;
  const versions = [...(data?.data.versions ?? []), ...older].filter(
    (row) =>
      !current ||
      row.instruction !== current.instruction ||
      !isEqual(row.editorData, current.editorData),
  );
  const selected = index === 0 ? current : versions[index - 1];
  const loadOlder = async () => {
    const last = [...(data?.data.versions ?? []), ...older].at(-1);
    if (!last || pending) return;
    setPending(true);
    setMutationError(undefined);
    try {
      const result = await taskMenuService.descriptionHistory({
        id: taskId,
        beforeRevision: last.domainRevision,
        limit: 50,
      });
      setOlder((previous) => [...previous, ...result.data.versions]);
      setMore(result.data.versions.length === 50);
    } catch (failure) {
      setMutationError(trpcErrorMessage(failure) ?? t('taskDetail.menu.failed'));
    } finally {
      setPending(false);
    }
  };
  const restore = async () => {
    const version = versions[index - 1];
    if (!current || !version || !canEdit || pending) return;
    setPending(true);
    setMutationError(undefined);
    try {
      const result = await taskMenuService.restoreDescription({
        id: taskId,
        historyId: version.id,
        expectedDomainRevision: current.domainRevision,
      });
      if (!result.data) throw new Error(t('taskDetail.menu.unavailable'));
      // The same task can be cached under its UUID and its identifier; every
      // mounted editor takes the restored text as an external change.
      const state = useTaskStore.getState();
      for (const [cacheId, detail] of Object.entries(state.taskDetailMap)) {
        if (cacheId !== taskId && detail.id !== taskId) continue;
        state.internal_dispatchTaskDetail(
          {
            id: cacheId,
            type: 'updateTaskDetail',
            value: {
              instruction: result.data.instruction,
              editorData: result.data.editorData,
              domainRevision: result.data.domainRevision,
            },
          },
          { instructionSource: 'external' },
        );
      }
      await onChanged();
      close();
    } catch (failure) {
      setMutationError(trpcErrorMessage(failure) ?? t('taskDetail.menu.failed'));
    } finally {
      setPending(false);
    }
  };
  if (isLoading) return <Spinner />;
  if (error) return <AsyncError error={error} onRetry={() => void mutate()} />;
  if (!current) return null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Button
          disabled={pending || index >= versions.length}
          size="sm"
          type="button"
          variant="outline"
          onClick={() => setIndex(index + 1)}
        >
          <ChevronLeftIcon />
          {t('taskDetail.menu.previousChange')}
        </Button>
        <Button
          disabled={pending || index === 0}
          size="sm"
          type="button"
          variant="outline"
          onClick={() => setIndex(index - 1)}
        >
          {t('taskDetail.menu.nextChange')}
          <ChevronRightIcon />
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
        <div className="flex max-h-96 flex-col gap-1 overflow-auto">
          <Button
            className="h-auto justify-start py-2 text-left"
            disabled={pending}
            type="button"
            variant={index === 0 ? 'secondary' : 'ghost'}
            onClick={() => setIndex(0)}
          >
            {t('taskDetail.menu.currentVersion')}
          </Button>
          {versions.map((version, position) => (
            <Button
              className="h-auto flex-col items-start gap-1 py-2 text-left text-xs"
              disabled={pending}
              key={version.id}
              type="button"
              variant={index === position + 1 ? 'secondary' : 'ghost'}
              onClick={() => setIndex(position + 1)}
            >
              <span>{new Date(version.createdAt).toLocaleString()}</span>
              <HistoryAuthor userId={version.authorUserId} />
              {version.captureSource === 'baseline' ? (
                <span className="text-muted-foreground">
                  {t('taskDetail.menu.observedBaseline')}
                </span>
              ) : null}
            </Button>
          ))}
          {versions.length === 0 ? (
            <p className="px-2 py-1 text-xs text-muted-foreground">
              {t('taskDetail.menu.noHistory')}
            </p>
          ) : null}
          {more && (data?.data.versions.length ?? 0) >= 50 ? (
            <Button
              loading={pending}
              type="button"
              variant="ghost"
              onClick={() => void loadOlder()}
            >
              {t('taskDetail.menu.loadOlder')}
            </Button>
          ) : null}
        </div>
        <div className="max-h-96 min-w-0 overflow-auto rounded-md border p-3">
          <Markdown>{selected?.instruction ?? ''}</Markdown>
        </div>
      </div>
      {mutationError ? (
        <div className="flex flex-col gap-2 text-sm text-destructive" role="alert">
          <p>{mutationError}</p>
          <Button
            disabled={pending}
            size="sm"
            type="button"
            variant="outline"
            onClick={async () => {
              await mutate();
              setIndex(0);
              setOlder([]);
              setMutationError(undefined);
            }}
          >
            {t('taskDetail.menu.reloadHistory')}
          </Button>
        </div>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button disabled={pending} type="button" variant="outline" onClick={close}>
          {t('close', { ns: 'common' })}
        </Button>
        <Button
          disabled={!canEdit || index === 0 || !selected}
          loading={pending}
          title={index === 0 ? t('taskDetail.menu.currentVersionHint') : undefined}
          type="button"
          onClick={() => void restore()}
        >
          {t('taskDetail.menu.restoreVersion')}
        </Button>
      </div>
    </div>
  );
};

export const openTaskDescriptionHistoryModal = (props: HistoryModalProps) =>
  createModal({
    content: <TaskDescriptionHistory {...props} />,
    footer: null,
    title: translate('taskDetail.menu.historyTitle', { ns: 'chat', identifier: props.identifier }),
    width: 'min(95vw, 850px)',
  });
