'use client';

import { Flexbox } from '@lobehub/ui';
import { ActionIcon, confirmModal, Text, toast } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import dayjs from 'dayjs';
import { FilePenLineIcon, MessageCircleIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncError from '@/components/AsyncError';
import NavHeader from '@/features/NavHeader';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { mutate, useClientDataSWR } from '@/libs/swr';
import { taskDraftKeys, taskDraftService } from '@/services/taskDraft';

import DraftContentPreview from './DraftContentPreview';
import { draftEditPath } from './draftEditPath';

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
  preview: css`
    overflow: hidden;

    height: 82px;
    margin-block-start: 16px;
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

const TaskDraftsPage = () => {
  const { t } = useTranslation('common');
  const workspaceId = useActiveWorkspaceId();
  const { data, error, isLoading } = useClientDataSWR(taskDraftKeys.list(workspaceId), () =>
    taskDraftService.list(workspaceId),
  );
  const drafts = data?.data ?? [];
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
  const discardAll = async () => {
    if (deleting) return;
    setDeleting('all');
    try {
      await taskDraftService.deleteAll(workspaceId);
      await refresh();
    } catch {
      toast.error(t('drafts.error.discard'));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <Flexbox flex={1} height="100%" style={{ minHeight: 0 }}>
      <NavHeader
        className={styles.header}
        left={<Text weight={500}>{t('drafts.title')}</Text>}
        right={
          drafts.length > 0 && (
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
        <Text style={{ padding: 18 }}>{t('drafts.loading')}</Text>
      ) : drafts.length === 0 ? (
        <Flexbox align="center" flex={1} gap={8} justify="center">
          <FilePenLineIcon size={28} />
          <Text>{t('drafts.empty')}</Text>
        </Flexbox>
      ) : (
        <div style={{ overflowY: 'auto' }}>
          <div className={styles.sectionTitle}>{t('drafts.comments')}</div>
          <div className={styles.cardGrid}>
            {drafts.map((draft) => (
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
                  aria-label={`${t('drafts.edit')}: ${draft.taskName || draft.taskIdentifier}`}
                  className={styles.cardLink}
                  to={draftEditPath(draft)}
                />
                <div className={styles.cardContent}>
                  <div className={styles.cardHeading}>
                    <div className={styles.cardTitle}>{draft.taskName || draft.taskIdentifier}</div>
                    <Text fontSize={12} title={String(draft.updatedAt)} type="secondary">
                      {dayjs(draft.updatedAt).fromNow()}
                    </Text>
                  </div>
                  <div className={styles.preview}>
                    <div className={styles.previewLabel}>
                      <MessageCircleIcon size={16} />
                      {t('drafts.commentingOnIssue')}
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
            ))}
          </div>
        </div>
      )}
    </Flexbox>
  );
};

export default TaskDraftsPage;
