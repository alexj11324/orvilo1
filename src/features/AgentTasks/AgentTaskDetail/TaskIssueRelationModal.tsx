import { t as translate } from 'i18next';
import { CheckIcon } from 'lucide-react';
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

import {
  dependentIdentifier,
  isMultiSelectRelation,
  type MarkIssueRelationKind,
  type RelationCandidate,
  relationPickerRows,
  relationRejectionKey,
  relationSearchEligibility,
  toggleRelationCandidate,
  writeRelationsOneByOne,
} from './issueRelationPicker';

export type { MarkIssueRelationKind } from './issueRelationPicker';

interface RelationModalProps {
  expectedDomainRevision: number;
  /** Readable id of the Issue being edited — names it in a refusal. */
  identifier?: string;
  kind: MarkIssueRelationKind;
  onChanged: () => Promise<void>;
  taskId: string;
  /** Overrides the "Mark as" wording when the picker is opened from elsewhere. */
  title?: string;
}

const TaskIssueRelationPicker = ({
  taskId,
  expectedDomainRevision,
  identifier,
  kind,
  onChanged,
}: RelationModalProps) => {
  const { t } = useTranslation(['chat', 'common']);
  const { close } = useModalContext();
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState(false);
  const [mutationErrors, setMutationErrors] = useState<string[]>([]);
  const [selected, setSelected] = useState<RelationCandidate[]>([]);
  const multiple = isMultiSelectRelation(kind);
  const eligibility = relationSearchEligibility(kind);
  const { data, error, isLoading, mutate } = useClientDataSWR(
    query.trim() ? ['issue-relation-search', taskId, kind, query.trim()] : null,
    () =>
      workAttentionService.search({
        eligibleFor: eligibility ? { relation: eligibility, taskId } : undefined,
        limitPerType: 15,
        query: query.trim(),
        type: 'task',
      }),
  );
  const hits: RelationCandidate[] = (data?.data ?? []).flatMap((hit) =>
    hit.type === 'task' && hit.id !== taskId
      ? [
          {
            id: hit.id,
            identifier: hit.description?.trim() || hit.id,
            parentIdentifier: hit.parentIdentifier,
            title: hit.title,
          },
        ]
      : [],
  );
  const rows = multiple ? relationPickerRows(selected, hits) : hits;
  const isParentLink = kind === 'parentOf' || kind === 'subIssueOf';

  /** The specific reason when the server names one, its own message otherwise. */
  const describe = (failure: unknown, candidate?: RelationCandidate) => {
    const key = relationRejectionKey(failure, isParentLink ? 'parent' : 'dependency');
    const reason = key
      ? t(key, {
          identifier: dependentIdentifier(
            kind === 'blocking',
            identifier ?? '',
            candidate?.identifier ?? '',
          ),
        })
      : (trpcErrorMessage(failure) ?? t('taskDetail.menu.failed'));
    return candidate && !isParentLink
      ? t('taskDetail.picker.notAdded', { identifier: candidate.identifier, reason })
      : reason;
  };

  const chooseOne = async (target: RelationCandidate) => {
    if (pending) return;
    setPending(true);
    setMutationErrors([]);
    try {
      if (kind === 'subIssueOf')
        await taskService.update(taskId, { parentTaskId: target.id, expectedDomainRevision });
      else
        await taskMenuService.markDuplicate({
          id: taskId,
          targetId: target.id,
          expectedDomainRevision,
        });
      await onChanged();
      close();
    } catch (failure) {
      setMutationErrors([describe(failure)]);
    } finally {
      setPending(false);
    }
  };

  const submitSelection = async () => {
    if (pending || selected.length === 0) return;
    setPending(true);
    setMutationErrors([]);
    try {
      if (kind === 'parentOf') {
        // One transaction: every picked Issue moves under this one, or none does.
        await taskService.setParentBatch(
          taskId,
          selected.map((item) => item.id),
        );
        await onChanged();
        close();
        return;
      }
      const { added, failed } = await writeRelationsOneByOne(selected, (candidate) =>
        kind === 'blocking'
          ? taskService.addDependency(candidate.id, taskId, 'blocks')
          : taskService.addDependency(
              taskId,
              candidate.id,
              kind === 'relatedTo' ? 'relates' : 'blocks',
            ),
      );
      if (added.length > 0) await onChanged();
      if (failed.length === 0) {
        close();
        return;
      }
      // Keep only what was refused selected, each with its own reason.
      setSelected(failed.map((item) => item.candidate));
      setMutationErrors(failed.map((item) => describe(item.error, item.candidate)));
    } catch (failure) {
      setMutationErrors([describe(failure)]);
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
      {eligibility ? (
        <p className="text-xs text-muted-foreground">
          {t(`taskDetail.picker.scope.${eligibility}`)}
        </p>
      ) : null}
      {error ? (
        <AsyncError error={error} onRetry={() => void mutate()} />
      ) : isLoading ? (
        <Spinner />
      ) : query.trim() && hits.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('taskDetail.menu.noIssues')}</p>
      ) : null}
      <div className="flex max-h-80 flex-col gap-1 overflow-auto">
        {rows.map((hit) => {
          const picked = selected.some((item) => item.id === hit.id);
          return (
            <Button
              aria-pressed={multiple ? picked : undefined}
              className="h-auto justify-start gap-2 py-2 text-left"
              disabled={pending}
              key={hit.id}
              type="button"
              variant="ghost"
              onClick={() =>
                multiple
                  ? setSelected((current) => toggleRelationCandidate(current, hit))
                  : void chooseOne(hit)
              }
            >
              {multiple ? (
                <span
                  aria-hidden
                  className={
                    picked
                      ? 'flex size-4 shrink-0 items-center justify-center rounded-(--radius-chip) border border-primary bg-primary text-primary-foreground'
                      : 'flex size-4 shrink-0 items-center justify-center rounded-(--radius-chip) border border-border'
                  }
                >
                  {picked ? <CheckIcon className="size-3" /> : null}
                </span>
              ) : null}
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {hit.identifier}
              </span>
              <span className="min-w-0 flex-1 truncate">{hit.title}</span>
              {kind === 'parentOf' && hit.parentIdentifier ? (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {t('taskDetail.picker.movesFrom', { identifier: hit.parentIdentifier })}
                </span>
              ) : null}
            </Button>
          );
        })}
      </div>
      {mutationErrors.length > 0 ? (
        <div className="flex flex-col gap-1 text-sm text-destructive-text" role="alert">
          {mutationErrors.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        {multiple && selected.length > 0 ? (
          <span className="mr-auto text-xs text-muted-foreground">
            {t('taskDetail.picker.selected', { count: selected.length })}
          </span>
        ) : null}
        <Button disabled={pending} type="button" variant="outline" onClick={close}>
          {t('cancel', { ns: 'common' })}
        </Button>
        {multiple ? (
          <Button
            disabled={pending || selected.length === 0}
            loading={pending}
            type="button"
            onClick={() => void submitSelection()}
          >
            {selected.length === 0
              ? t('taskDetail.picker.addNone')
              : t('taskDetail.picker.add', { count: selected.length })}
          </Button>
        ) : null}
      </div>
    </div>
  );
};

export const openTaskIssueRelationModal = (props: RelationModalProps) =>
  createModal({
    content: <TaskIssueRelationPicker {...props} />,
    footer: null,
    title: props.title ?? translate(`taskDetail.menu.mark.${props.kind}`, { ns: 'chat' }),
    width: 480,
  });
