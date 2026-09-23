'use client';

import { Flexbox } from '@lobehub/ui';
import { ActionIcon, confirmModal, Text, toast } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import dayjs from 'dayjs';
import { FilePenLineIcon, MessageCircleIcon, SquarePenIcon, Trash2Icon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncError from '@/components/AsyncError';
import { createSurfaceSkeleton } from '@/components/Skeleton/Surface';
import { createTaskModal } from '@/features/AgentTasks/CreateTaskModal';
import { taskDetailPath } from '@/features/AgentTasks/shared/taskDetailPath';
import NavHeader from '@/features/NavHeader';
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

const styles = createStaticStyles(({ css }) => ({
  card: css`
    position: relative;

    display: block;

    min-height: 139px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;

    color: ${cssVar.colorText};
    text-decoration: none;

    background: ${cssVar.colorBgContainer};

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  cardButton: css`
    cursor: pointer;

    position: absolute;
    z-index: 1;
    inset: 0;

    display: block;

    padding: 0;
    border: none;

    font: inherit;
    color: inherit;
    text-align: start;

    background: none;

    &:focus-visible {
      outline: 2px solid ${cssVar.colorPrimary};
      outline-offset: 2px;
    }
  `,
  cardLink: css`
    position: absolute;
    z-index: 1;
    inset: 0;

    display: block;

    color: inherit;
    text-decoration: none;

    &:focus-visible {
      outline: 2px solid ${cssVar.colorPrimary};
      outline-offset: 2px;
    }
  `,
  cardContent: css`
    padding-block: 12px;
    padding-inline: 16px;
  `,
  cardHeading: css`
    display: flex;
    gap: 8px;
    align-items: center;
    padding-inline-end: 24px;
  `,
  cardGrid: css`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 468px), 468px));
    gap: 16px;

    padding-block: 8px 24px;
    padding-inline: 18px;

    @media (width <= 680px) {
      grid-template-columns: minmax(0, 1fr);
    }
  `,
  cardTitle: css`
    overflow: hidden;
    flex: 1;

    min-width: 0;

    font-size: 13px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  discard: css`
    position: absolute;
    z-index: 2;
    inset-block-start: 11px;
    inset-inline-end: 11px;
  `,
  excerpt: css`
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;

    max-height: 42px;

    font-size: 13px;
    line-height: 21px;

    p {
      margin: 0;
    }
  `,
  issueChip: css`
    overflow: hidden;
    display: inline-flex;
    gap: 4px;
    align-items: center;

    min-width: 0;
    padding-block: 1px;
    padding-inline: 6px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 4px;

    white-space: nowrap;
  `,
  issueChipIdentifier: css`
    flex: none;
    font-family: ${cssVar.fontFamilyCode};
  `,
  issueChipName: css`
    overflow: hidden;
    text-overflow: ellipsis;
  `,
  preview: css`
    overflow: hidden;

    height: 81px;
    margin-block-start: 12px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 6px;
  `,
  previewLabel: css`
    display: flex;
    gap: 8px;
    align-items: center;

    height: 32px;
    padding-inline: 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
    white-space: nowrap;
  `,
  previewLabelText: css`
    flex: none;
  `,
  previewBody: css`
    overflow: hidden;
    padding-block: 8px;
    padding-inline: 12px;
  `,
  header: css`
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  sectionTitle: css`
    padding-block: 16px 0;
    padding-inline: 18px;
    font-size: 13px;
    font-weight: 500;
  `,
}));

// The page renders its own NavHeader, so the in-page skeleton is body-only;
// the route-level meta keeps the headered variant for chunk loads.
const DraftsSkeleton = createSurfaceSkeleton('list', false);

const TaskDraftsPage = () => {
  const { t } = useTranslation('common');
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
    <Flexbox flex={1} height="100%" style={{ minHeight: 0 }}>
      <NavHeader
        className={styles.header}
        left={<Text weight={500}>{t('drafts.title')}</Text>}
        right={
          !isEmpty && (
            <ActionIcon
              aria-label={t('drafts.discardAll')}
              disabled={!!deleting}
              icon={Trash2Icon}
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
        <Flexbox align="center" flex={1} gap={8} justify="center">
          <FilePenLineIcon size={28} />
          <Text>{t('drafts.empty')}</Text>
        </Flexbox>
      ) : (
        <div style={{ overflowY: 'auto' }}>
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
                        className={styles.discard}
                        disabled={!!deleting}
                        icon={Trash2Icon}
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
                          <Text
                            fontSize={12}
                            title={dayjs(draft.updatedAt).toString()}
                            type="secondary"
                          >
                            {dayjs(draft.updatedAt).fromNow()}
                          </Text>
                        </div>
                        <div className={styles.preview}>
                          <div className={styles.previewLabel}>
                            <SquarePenIcon size={16} style={{ flex: 'none' }} />
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
                        className={styles.discard}
                        disabled={!!deleting}
                        icon={Trash2Icon}
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
                          <Text fontSize={12} title={String(draft.updatedAt)} type="secondary">
                            {dayjs(draft.updatedAt).fromNow()}
                          </Text>
                        </div>
                        <div className={styles.preview}>
                          <div className={styles.previewLabel}>
                            <MessageCircleIcon size={16} style={{ flex: 'none' }} />
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
    </Flexbox>
  );
};

export default TaskDraftsPage;
