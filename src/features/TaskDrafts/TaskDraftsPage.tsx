'use client';

import { clsx as cx } from 'cn';
import dayjs from 'dayjs';
import { FilePenLineIcon, MessageCircleIcon, SquarePenIcon, Trash2Icon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import ActionIcon from '@/components/ActionIcon';
import AsyncError from '@/components/AsyncError';
import { confirmModal } from '@/components/Modal';
import SimpleEmpty from '@/components/SimpleEmpty';
import { createSurfaceSkeleton } from '@/components/Skeleton/Surface';
import { toast } from '@/components/toast';
import { createTaskModal } from '@/features/AgentTasks/CreateTaskModal';
import { taskDetailPath } from '@/features/AgentTasks/shared/taskDetailPath';
import NavHeader from '@/features/NavHeader';
import { formatInboxAge } from '@/features/WorkInbox/inboxAge';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { mutate, useClientDataSWR } from '@/libs/swr';
import { lambdaClient } from '@/libs/trpc/client';
import { taskDraftKeys, taskDraftService } from '@/services/taskDraft';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import { draftCardTitle, issueDraftCardTitle } from './draftCardTitle';
import DraftContentPreview from './DraftContentPreview';
import { draftEditPath } from './draftEditPath';
import {
  removeAllTaskCreateDrafts,
  removeTaskCreateDraft,
  type TaskCreateDraft,
  useTaskCreateDrafts,
} from './taskCreateDrafts';

const styles = {
  card: 'relative block h-35 overflow-hidden rounded-(--radius-card) border-[0.5px] border-border bg-fill-quaternary text-foreground no-underline hover:bg-accent [&:hover_.draft-discard]:opacity-100 [&:focus-within_.draft-discard]:opacity-100',
  cardButton:
    'absolute inset-0 z-1 block cursor-pointer border-0 bg-transparent p-0 [font:inherit] text-inherit text-start outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2',
  cardLink:
    'absolute inset-0 z-1 block text-inherit no-underline outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2',
  cardContent: 'pbs-4 pbe-0 px-4',
  cardHeading: 'flex items-center gap-2 pe-9',
  cardGrid:
    'grid grid-cols-[repeat(auto-fill,minmax(min(100%,468px),468px))] gap-4 pbs-2 pbe-6 px-4 [@media(width<=680px)]:grid-cols-[minmax(0,1fr)]',
  cardTitle:
    'min-w-0 shrink grow-0 basis-auto overflow-hidden text-sm leading-5.5 font-medium text-ellipsis whitespace-nowrap',
  discard:
    'absolute z-2 inset-bs-3 inset-e-3 opacity-0 transition-opacity duration-(--orvilo-motion-fast) [@media(hover:none)]:opacity-100',
  excerpt: 'overflow-hidden line-clamp-2 max-h-11 text-sm leading-5.5 [&_p]:m-0',
  issueChip:
    'inline-flex min-w-0 items-center gap-1 overflow-hidden rounded-(--radius-chip) border border-divider px-1.5 py-0.25 text-xs leading-5 whitespace-nowrap',
  issueChipIdentifier: 'flex-none font-mono',
  issueChipName: 'overflow-hidden text-ellipsis',
  preview:
    'h-22.5 overflow-hidden mbs-4 rounded-ss-(--radius-card) rounded-se-(--radius-card) border-[0.5px] border-border border-be-0',
  previewLabel:
    'flex h-8 items-center gap-2 border-be border-divider px-3 text-xs leading-5 font-medium text-foreground-description whitespace-nowrap',
  previewLabelText: 'flex-none',
  previewBody: 'overflow-hidden py-2 px-3',
  header: 'border-be border-divider',
  sectionTitle: 'pbs-4 pbe-0 px-4 text-base leading-6 font-semibold text-foreground-description',
};

// The page renders its own NavHeader, so the in-page skeleton is body-only;
// the route-level meta keeps the headered variant for chunk loads.
const DraftsSkeleton = createSurfaceSkeleton('list', false);

const TaskDraftsPage = () => {
  const { i18n, t } = useTranslation('common');
  const workspaceId = useActiveWorkspaceId();
  const navigate = useWorkspaceAwareNavigate();
  const currentUserId = useUserStore(userProfileSelectors.userId);
  const { data, error, isLoading } = useClientDataSWR(taskDraftKeys.list(workspaceId), () =>
    taskDraftService.list(workspaceId),
  );
  const drafts = data?.data ?? [];
  // Issue drafts are local (a draft has no task yet), so they read through the
  // reactive localStorage store rather than the comment-draft service.
  const issueDrafts = useTaskCreateDrafts(workspaceId);
  // Same key + fetcher as MyWorkPage — one shared cache entry — so a reopened
  // draft keeps its team editable in the composer's team picker.
  const { data: teamsData } = useSWR(
    workspaceId && currentUserId ? ['work-joined-teams', currentUserId, workspaceId] : null,
    () => lambdaClient.team.teams.query(),
    { revalidateOnFocus: false },
  );
  const joinedTeamOptions = useMemo(
    () =>
      (teamsData?.data ?? [])
        .filter((team) => team.joined === true)
        .map((team) => ({ id: team.id, name: team.name })),
    [teamsData],
  );
  const [deleting, setDeleting] = useState<string | null>(null);
  const refresh = async () => {
    await Promise.all([
      mutate(taskDraftKeys.list(workspaceId)),
      mutate(taskDraftKeys.count(workspaceId)),
    ]);
  };
  const discard = async (taskId: string) => {
    if (deleting) return;
    setDeleting(taskId);
    try {
      await taskDraftService.delete(taskId, workspaceId);
      await refresh();
    } catch {
      toast.error(t('drafts.error.discard'));
    } finally {
      setDeleting(null);
    }
  };
  const discardIssueDraft = (id: string) => {
    removeTaskCreateDraft(workspaceId, id);
  };
  const discardAll = async () => {
    if (deleting) return;
    setDeleting('all');
    try {
      await taskDraftService.deleteAll(workspaceId);
      removeAllTaskCreateDrafts(workspaceId);
      await refresh();
    } catch {
      toast.error(t('drafts.error.discard'));
    } finally {
      setDeleting(null);
    }
  };
  // Reopen the create-issue composer on the draft — Linear's Edit-draft flow
  // for issue drafts is the same modal, prefilled.
  const openIssueDraft = (draft: TaskCreateDraft) => {
    createTaskModal({
      draft,
      onCreated: (task) =>
        navigate(taskDetailPath(task.identifier, task.agentId ?? undefined, task.name)),
      projectId: draft.projectId,
      showInlineToggle: false,
      teamOptions: joinedTeamOptions,
    });
  };
  const isEmpty = drafts.length === 0 && issueDrafts.length === 0;

  return (
    <div className="flex min-h-0 flex-col flex-1 h-full text-sm leading-5.5">
      <NavHeader
        className={styles.header}
        left={<div className="font-medium">{t('drafts.title')}</div>}
        right={
          !isEmpty && (
            <ActionIcon
              aria-label={t('drafts.discardAll')}
              disabled={!!deleting}
              icon={Trash2Icon}
              size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
              onClick={() =>
                confirmModal({
                  content: t('drafts.confirmDiscardAll.content'),
                  okButtonProps: { danger: true },
                  okText: t('drafts.discardAll'),
                  onOk: discardAll,
                  title: t('drafts.confirmDiscardAll.title'),
                })
              }
            />
          )
        }
      />
      {error ? (
        <AsyncError error={error} variant="page" onRetry={refresh} />
      ) : isLoading ? (
        <DraftsSkeleton />
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center flex-1 p-12">
          <SimpleEmpty description={t('drafts.empty')} icon={FilePenLineIcon} />
        </div>
      ) : (
        <div className="overflow-y-auto">
          {issueDrafts.length > 0 && (
            <>
              <div className={styles.sectionTitle}>{t('drafts.issues')}</div>
              <div className={styles.cardGrid}>
                {issueDrafts.map((draft) => {
                  const title = issueDraftCardTitle(draft, {
                    attachment: t('drafts.attachment'),
                    untitled: t('drafts.untitled'),
                  });
                  return (
                    <div className={styles.card} key={draft.id}>
                      <ActionIcon
                        aria-label={t('drafts.discard')}
                        className={cx(styles.discard, 'draft-discard')}
                        disabled={!!deleting}
                        icon={Trash2Icon}
                        size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
                        onClick={() =>
                          confirmModal({
                            content: t('drafts.confirmDiscardIssue.content'),
                            okButtonProps: { danger: true },
                            okText: t('drafts.discard'),
                            onOk: () => discardIssueDraft(draft.id),
                            title: t('drafts.confirmDiscard.title'),
                          })
                        }
                      />
                      <button
                        aria-label={`${t('drafts.edit')}: ${title}`}
                        className={styles.cardButton}
                        type="button"
                        onClick={() => openIssueDraft(draft)}
                      />
                      <div className={styles.cardContent}>
                        <div className={styles.cardHeading}>
                          <div className={styles.cardTitle}>{title}</div>
                          <div
                            className="text-xs leading-5 text-muted-foreground"
                            title={dayjs(draft.updatedAt).toString()}
                          >
                            {formatInboxAge(draft.updatedAt, { locale: i18n.language })}
                          </div>
                        </div>
                        <div className={styles.preview}>
                          <div className={styles.previewLabel}>
                            <SquarePenIcon className="shrink-0" size={16} />
                            <span className={styles.previewLabelText}>{t('drafts.newIssue')}</span>
                          </div>
                          <div aria-hidden inert className={styles.previewBody}>
                            <div className={styles.excerpt}>
                              <DraftContentPreview
                                attachmentLabel={t('drafts.attachment')}
                                content={draft.content}
                                editorData={draft.editorData}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {drafts.length > 0 && (
            <>
              <div className={styles.sectionTitle}>{t('drafts.comments')}</div>
              <div className={styles.cardGrid}>
                {drafts.map((draft) => {
                  const title = draftCardTitle(draft, t('drafts.attachment'));
                  return (
                    <div className={styles.card} key={draft.id}>
                      <ActionIcon
                        aria-label={t('drafts.discard')}
                        className={cx(styles.discard, 'draft-discard')}
                        disabled={!!deleting}
                        icon={Trash2Icon}
                        size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
                        onClick={() =>
                          confirmModal({
                            content: t('drafts.confirmDiscard.content'),
                            okButtonProps: { danger: true },
                            okText: t('drafts.discard'),
                            onOk: () => discard(draft.taskId),
                            title: t('drafts.confirmDiscard.title'),
                          })
                        }
                      />
                      <WorkspaceLink
                        aria-label={`${t('drafts.edit')}: ${title}`}
                        className={styles.cardLink}
                        to={draftEditPath(draft)}
                      />
                      <div className={styles.cardContent}>
                        <div className={styles.cardHeading}>
                          <div className={styles.cardTitle}>{title}</div>
                          <div
                            className="text-xs leading-5 text-muted-foreground"
                            title={String(draft.updatedAt)}
                          >
                            {formatInboxAge(draft.updatedAt, { locale: i18n.language })}
                          </div>
                        </div>
                        <div className={styles.preview}>
                          <div className={styles.previewLabel}>
                            <MessageCircleIcon className="shrink-0" size={16} />
                            <span className={styles.previewLabelText}>
                              {t('drafts.commentingOnIssue')}
                            </span>
                            <span className={styles.issueChip}>
                              <span className={styles.issueChipIdentifier}>
                                {draft.taskIdentifier}
                              </span>
                              {draft.taskName ? (
                                <span className={styles.issueChipName}>{draft.taskName}</span>
                              ) : null}
                            </span>
                          </div>
                          <div aria-hidden inert className={styles.previewBody}>
                            <div className={styles.excerpt}>
                              <DraftContentPreview
                                attachmentLabel={t('drafts.attachment')}
                                content={draft.content}
                                editorData={draft.editorData}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default TaskDraftsPage;
