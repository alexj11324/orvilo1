import { t as translate } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import { createModal, useModalContext } from '@/components/Modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useClientDataSWR } from '@/libs/swr';
import { taskService } from '@/services/task';
import { taskMenuService } from '@/services/taskMenu';
import { workAttentionService } from '@/services/workAttention';
import { trpcErrorMessage } from '@/utils/trpcError';

export type MarkIssueRelationKind =
  'parentOf' | 'subIssueOf' | 'relatedTo' | 'blockedBy' | 'blocking' | 'duplicateOf';
interface RelationModalProps {
  expectedDomainRevision: number;
  kind: MarkIssueRelationKind;
  onChanged: () => Promise<void>;
  taskId: string;
}

const TaskIssueRelationPicker = ({
  taskId,
  expectedDomainRevision,
  kind,
  onChanged,
}: RelationModalProps) => {
  const { t } = useTranslation(['chat', 'common']);
  const { close } = useModalContext();
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState(false);
  const [mutationError, setMutationError] = useState<string>();
  const { data, error, isLoading, mutate } = useClientDataSWR(
    query.trim() ? ['issue-relation-search', taskId, query.trim()] : null,
    () => workAttentionService.search({ query: query.trim(), type: 'task', limitPerType: 15 }),
  );
  const hits = (data?.data ?? []).filter((hit) => hit.type === 'task' && hit.id !== taskId);
  const choose = async (targetId: string) => {
    if (pending) return;
    setPending(true);
    setMutationError(undefined);
    try {
      if (kind === 'parentOf') {
        const target = await taskService.getDetail(targetId);
        if (!target.data?.domainRevision) throw new Error(t('taskDetail.menu.unavailable'));
        await taskService.update(targetId, {
          parentTaskId: taskId,
          expectedDomainRevision: target.data.domainRevision,
        });
      } else if (kind === 'subIssueOf')
        await taskService.update(taskId, { parentTaskId: targetId, expectedDomainRevision });
      else if (kind === 'duplicateOf')
        await taskMenuService.markDuplicate({ id: taskId, targetId, expectedDomainRevision });
      else if (kind === 'blocking') await taskService.addDependency(targetId, taskId, 'blocks');
      else
        await taskService.addDependency(
          taskId,
          targetId,
          kind === 'relatedTo' ? 'relates' : 'blocks',
        );
      await onChanged();
      close();
    } catch (failure) {
      setMutationError(trpcErrorMessage(failure) ?? t('taskDetail.menu.failed'));
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <Input
        autoFocus
        aria-label={t('taskDetail.menu.searchIssues')}
        disabled={pending}
        placeholder={t('taskDetail.menu.searchIssues')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {error ? (
        <AsyncError error={error} onRetry={() => void mutate()} />
      ) : isLoading ? (
        <Spinner />
      ) : query.trim() && hits.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('taskDetail.menu.noIssues')}</p>
      ) : null}
      <div className="flex max-h-80 flex-col gap-1 overflow-auto">
        {hits.map((hit) => (
          <Button
            className="h-auto justify-start gap-2 py-2 text-left"
            disabled={pending}
            key={hit.id}
            type="button"
            variant="ghost"
            onClick={() => void choose(hit.id)}
          >
            <span className="shrink-0 text-xs text-muted-foreground">{hit.description}</span>
            <span className="truncate">{hit.title}</span>
          </Button>
        ))}
      </div>
      {mutationError ? (
        <p className="text-sm text-destructive" role="alert">
          {mutationError}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button disabled={pending} type="button" variant="outline" onClick={close}>
          {t('cancel', { ns: 'common' })}
        </Button>
      </div>
    </div>
  );
};

export const openTaskIssueRelationModal = (props: RelationModalProps) =>
  createModal({
    content: <TaskIssueRelationPicker {...props} />,
    footer: null,
    title: translate(`taskDetail.menu.mark.${props.kind}`, { ns: 'chat' }),
    width: 480,
  });
