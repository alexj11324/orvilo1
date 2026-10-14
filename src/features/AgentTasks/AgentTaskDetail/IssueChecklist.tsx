import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { useClientDataSWR } from '@/libs/swr';
import { taskService } from '@/services/task';
import { useTaskStore } from '@/store/task';
import { taskDetailSelectors } from '@/store/task/selectors';

import { pendingChecklistResultIds } from './issueChecklistDecisions';
import { useTaskDetailSelector, useTaskDetailTaskId } from './TaskDetailScope';
import { TaskIssuePlan } from './TaskIssuePlan';

type ChecklistData = Awaited<ReturnType<typeof taskService.getChecklist>>['data'];

export const IssueChecklist = () => {
  const { t } = useTranslation('chat');
  const taskId = useTaskDetailTaskId();
  const databaseId = useTaskDetailSelector(taskDetailSelectors.taskDatabaseId);
  const refreshDetail = useTaskStore((state) => state.internal_refreshTaskDetail);
  const { data, error, isLoading, isValidating, mutate } = useClientDataSWR(
    databaseId ? ['issueChecklist', databaseId] : null,
    () => taskService.getChecklist(databaseId!),
  );
  const checklist: ChecklistData | undefined = data?.data;
  const [pending, setPending] = useState<string | null>(null);
  const [writeError, setWriteError] = useState(false);
  const current = checklist?.current;
  const currentRun = checklist?.history.find((run) => run.id === current?.runId);
  const acceptable = pendingChecklistResultIds(checklist?.results ?? [], current?.runId);
  const canDecide =
    checklist?.canAccept &&
    current?.proof &&
    currentRun &&
    currentRun.userDecision !== 'accept' &&
    !error;
  const decide = async (resultIds?: string[]) => {
    if (!databaseId || !taskId || !canDecide || !current?.proof || !current.runId || pending)
      return;
    setPending(resultIds?.join(',') ?? 'delivery');
    setWriteError(false);
    try {
      if (resultIds)
        await taskService.reviewChecklistItems({
          taskId: databaseId,
          runId: current.runId,
          proof: current.proof,
          resultIds,
          action: 'accept',
        });
      else
        await taskService.acceptDelivery({
          taskId: databaseId,
          runId: current.runId,
          proof: current.proof,
        });
      await Promise.all([mutate(), refreshDetail(taskId)]);
    } catch (error) {
      console.error('[IssueChecklist] Could not accept Checklist', error);
      setWriteError(true);
      await mutate();
    } finally {
      setPending(null);
    }
  };

  const renderResults = (run: ChecklistData['history'][number], historical: boolean) => {
    const results = checklist?.results.filter((result) => result.verifyRunId === run.id) ?? [];
    return (
      <div className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          {t('taskDetail.checklist.round', { round: (run.roundIndex ?? 0) + 1 })}
          {run.metadata?.issueDelivery?.sourceSha
            ? ` · ${run.metadata.issueDelivery.sourceSha}`
            : ''}
        </p>
        {(run.plan ?? []).map((item) => {
          const result = results.find((result) => result.checkItemId === item.id);
          const evidence =
            checklist?.evidence.filter((entry) => entry.checkResultId === result?.id) ?? [];
          return (
            <div className="flex flex-col gap-1 border-b border-divider pb-3" key={item.id}>
              <div className="flex items-start gap-2">
                <Checkbox
                  aria-label={t('taskDetail.checklist.acceptItem', { title: item.title })}
                  checked={result?.userDecision === 'accepted'}
                  disabled={
                    historical ||
                    !canDecide ||
                    !result?.verdict ||
                    result.userDecision === 'accepted' ||
                    !!pending
                  }
                  onCheckedChange={(checked) => {
                    if (checked && result) void decide([result.id]);
                  }}
                />
                <span className="flex-1">{item.title}</span>
                <span className="text-xs text-muted-foreground">
                  {t(`taskDetail.checklist.verdict.${result?.verdict ?? 'pending'}`)}
                </span>
              </div>
              {item.description && <p className="text-muted-foreground">{item.description}</p>}
              {typeof result?.metadata?.comment === 'string' && (
                <p className="whitespace-pre-wrap">{result.metadata.comment}</p>
              )}
              {result?.userDecision && (
                <p className="text-xs text-muted-foreground">
                  {t(`taskDetail.checklist.decision.${result.userDecision}`)}
                  {result.userDecisionDetail?.decidedAt
                    ? ` · ${result.userDecisionDetail.decidedAt}`
                    : ''}
                </p>
              )}
              {evidence.length ? (
                <div
                  aria-label={t('taskDetail.checklist.evidence')}
                  className="flex flex-col gap-2"
                >
                  {evidence.map((entry) => (
                    <div className="flex flex-col gap-1" key={entry.id}>
                      {entry.description && (
                        <p className="text-xs text-muted-foreground">{entry.description}</p>
                      )}
                      {entry.content && (
                        <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words text-xs">
                          {entry.content}
                        </pre>
                      )}
                      {entry.fileUrl && (
                        <a
                          className="text-primary-text underline"
                          href={entry.fileUrl}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          {entry.fileName || t('taskDetail.checklist.openEvidence')}
                        </a>
                      )}
                      {entry.fileId && !entry.fileUrl && (
                        <p className="text-xs text-muted-foreground">
                          {t('taskDetail.checklist.evidenceUnavailable')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {t('taskDetail.checklist.noEvidence')}
                </p>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <TaskIssuePlan onChanged={() => mutate()} />
      {error && (
        <div className="flex items-center gap-2" role="alert">
          <p className="text-destructive-text">{t('taskDetail.checklist.loadError')}</p>
          <Button loading={isValidating} size="sm" variant="ghost" onClick={() => void mutate()}>
            {t('taskDetail.plan.retry')}
          </Button>
        </div>
      )}
      {isLoading && !checklist ? (
        <Skeleton className="h-16 w-full" />
      ) : (
        checklist && (
          <>
            {currentRun ? (
              renderResults(currentRun, false)
            ) : checklist.definition ? (
              <ul className="list-inside list-disc">
                {checklist.definition.items.map((item) => (
                  <li key={item.id}>{item.title}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t('taskDetail.checklist.empty')}</p>
            )}
            {currentRun && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  disabled={!canDecide || !acceptable.length || !!pending}
                  loading={!!pending && pending !== 'delivery'}
                  size="sm"
                  variant="secondary"
                  onClick={() => void decide(acceptable)}
                >
                  {t('taskDetail.checklist.acceptAll')}
                </Button>
                <Button
                  loading={pending === 'delivery'}
                  size="sm"
                  disabled={
                    !canDecide ||
                    !current?.reviewerPassed ||
                    !current.necessaryChecksPassed ||
                    !current.itemsAccepted ||
                    !!pending
                  }
                  onClick={() => void decide()}
                >
                  {t('taskDetail.checklist.acceptDelivery')}
                </Button>
              </div>
            )}
            {current?.deliveryAccepted && (
              <p className="text-sm text-success-text" role="status">
                {t('taskDetail.checklist.deliveryAccepted')}
              </p>
            )}
            {checklist.history
              .filter((run) => run.id !== current?.runId)
              .map((run) => (
                <details key={run.id}>
                  <summary className="cursor-pointer text-sm">
                    {t('taskDetail.checklist.historyRound', { round: (run.roundIndex ?? 0) + 1 })}
                  </summary>
                  <div className="py-3">{renderResults(run, true)}</div>
                </details>
              ))}
          </>
        )
      )}
      {writeError && (
        <p className="text-sm text-destructive-text" role="alert">
          {t('taskDetail.checklist.writeError')}
        </p>
      )}
    </div>
  );
};
