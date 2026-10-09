import { t as translate } from 'i18next';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import { createModal } from '@/components/Modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { openDocumentModal } from '@/features/DocumentModal/loader';
import { useClientDataSWR } from '@/libs/swr';
import { pullRequestService } from '@/services/pullRequest';
import { trpcErrorMessage } from '@/utils/trpcError';

import { useTaskIssueResourceMutation } from './useTaskIssueResourceMutation';

export interface TaskIssueResourceModalProps {
  kind: 'link' | 'pull_request' | 'document';
  onChanged: () => Promise<void>;
  taskId: string;
}

export const TaskIssueResourcePicker = ({
  kind,
  onChanged,
  taskId,
}: TaskIssueResourceModalProps) => {
  const { t } = useTranslation(['chat', 'common']);
  const {
    close,
    createdDocumentId,
    documentAttached,
    editable,
    failure,
    pending,
    save,
    setFailure,
  } = useTaskIssueResourceMutation({ kind, taskId, onChanged });
  const formId = useId();
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'created' | 'for-me'>('created');
  const [cursor, setCursor] = useState<string | null>(null);
  const {
    data: queue,
    error,
    isLoading,
    mutate,
  } = useClientDataSWR<Awaited<ReturnType<typeof pullRequestService.queue>>>(
    kind === 'pull_request' ? ['issue-resource-pr-queue', tab, cursor] : null,
    () => pullRequestService.queue(tab, cursor),
    { shouldRetryOnError: false },
  );
  const items =
    queue?.data.items.filter((item) =>
      `${item.repository} #${item.number} ${item.title}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    ) ?? [];

  return (
    <div className="flex flex-col gap-3">
      {kind === 'pull_request' ? (
        <>
          <div className="flex gap-2">
            {(['created', 'for-me'] as const).map((value) => (
              <Button
                disabled={pending}
                key={value}
                type="button"
                variant={tab === value ? 'secondary' : 'ghost'}
                onClick={() => {
                  setTab(value);
                  setCursor(null);
                }}
              >
                {t(`taskDetail.resources.${value === 'created' ? 'created' : 'forMe'}`)}
              </Button>
            ))}
          </div>
          <Input
            autoFocus
            aria-label={t('taskDetail.resources.searchPullRequests')}
            placeholder={t('taskDetail.resources.searchPullRequests')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {error ? (
            <AsyncError
              description={trpcErrorMessage(error)}
              error={error}
              onRetry={() => void mutate()}
            />
          ) : isLoading ? (
            <Spinner />
          ) : (
            <>
              <div className="flex max-h-80 flex-col gap-1 overflow-auto">
                {items.map((item) => (
                  <Button
                    className="h-auto justify-start gap-2 py-2 text-left"
                    disabled={!editable || pending}
                    key={item.id}
                    type="button"
                    variant="ghost"
                    onClick={() => void save(item)}
                  >
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {item.repository} #{item.number}
                    </span>
                    <span className="truncate">{item.title}</span>
                  </Button>
                ))}
              </div>
              {!items.length ? (
                <p className="text-sm text-muted-foreground">
                  {t('taskDetail.resources.noPullRequests')}
                </p>
              ) : null}
              {queue?.data.hasMore && queue.data.endCursor ? (
                <Button
                  disabled={pending}
                  type="button"
                  variant="outline"
                  onClick={() => setCursor(queue.data.endCursor)}
                >
                  {t('taskDetail.resources.loadMore')}
                </Button>
              ) : null}
            </>
          )}
        </>
      ) : (
        <form
          className="flex flex-col gap-3"
          id={formId}
          onSubmit={(event) => {
            event.preventDefault();
            void save({ title, url });
          }}
        >
          {kind === 'link' ? (
            <Input
              autoFocus
              required
              aria-label={t('taskDetail.resources.url')}
              disabled={!editable || pending}
              maxLength={2048}
              placeholder={t('taskDetail.resources.url')}
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
          ) : null}
          <Input
            autoFocus={kind === 'document'}
            disabled={!editable || pending || !!createdDocumentId}
            maxLength={255}
            value={title}
            aria-label={t(
              `taskDetail.resources.${kind === 'document' ? 'documentTitle' : 'titleInput'}`,
            )}
            placeholder={t(
              `taskDetail.resources.${kind === 'document' ? 'documentTitle' : 'titleInput'}`,
            )}
            onChange={(event) => setTitle(event.target.value)}
          />
        </form>
      )}
      {failure ? (
        <p className="text-sm text-destructive" role="alert">
          {failure}
        </p>
      ) : null}
      {createdDocumentId && failure ? (
        <div className="flex flex-col gap-2">
          {!documentAttached ? (
            <p className="text-sm">{t('taskDetail.resources.createdUnattached')}</p>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              void openDocumentModal(createdDocumentId).catch((caught) =>
                setFailure(trpcErrorMessage(caught) ?? t('taskDetail.resources.failed')),
              )
            }
          >
            {t('taskDetail.resources.openDocument')}
          </Button>
        </div>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button disabled={pending} type="button" variant="outline" onClick={close}>
          {t('cancel', { ns: 'common' })}
        </Button>
        {kind !== 'pull_request' ? (
          <Button disabled={!editable} form={formId} loading={pending} type="submit">
            {createdDocumentId
              ? t('taskDetail.resources.retryAttach')
              : t(`taskDetail.menu.add.${kind}`)}
          </Button>
        ) : null}
      </div>
    </div>
  );
};

export const openTaskIssueResourceModal = (props: TaskIssueResourceModalProps) =>
  createModal({
    content: <TaskIssueResourcePicker {...props} />,
    footer: null,
    title: translate(`taskDetail.menu.add.${props.kind}`, { ns: 'chat' }),
    width: 520,
  });
