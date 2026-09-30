'use client';

import type { TaskStatus } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { createModal, useModalContext } from '@/components/Modal';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

import { STATUS_META } from './taskStatusMeta';

const styles = createStaticStyles(({ css }) => ({
  actions: css`
    padding: 16px;
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};
  `,
  content: css`
    padding-block: 20px 16px;
    padding-inline: 20px;
  `,
  list: css`
    max-height: 280px;
    margin-block-start: 8px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadius};
  `,
  row: css`
    padding-block: 6px;
    padding-inline: 12px;

    &:not(:last-child) {
      border-block-end: 1px solid ${cssVar.colorBorderSecondary};
    }
  `,
}));

interface TaskStatusCascadeModalContentProps {
  onApply: (includeSubtasks: boolean) => Promise<void>;
  onCancel: () => void;
  subtasks: TaskStatusCascadeItem[];
  targetStatus: TaskStatus;
}

export interface TaskStatusCascadeItem {
  identifier: string;
  name?: string | null;
  status?: string;
}

/**
 * Apply-and-close flow shared by the modal buttons: on failure the modal stays
 * open with an error toast so the user can retry or cancel explicitly, instead
 * of the rejection being silently discarded.
 */
export const useCascadeApply = (onApply: (includeSubtasks: boolean) => Promise<void>) => {
  const { t } = useTranslation('chat');
  const { close } = useModalContext();
  const [loadingAction, setLoadingAction] = useState<'all' | 'parent' | null>(null);

  const handleApply = async (includeSubtasks: boolean) => {
    setLoadingAction(includeSubtasks ? 'all' : 'parent');
    try {
      await onApply(includeSubtasks);
      close();
    } catch (error) {
      console.error('[TaskStatusCascadeModal] Failed to apply status change:', error);
      toast.error(t('taskDetail.statusCascade.applyFailed'));
    } finally {
      setLoadingAction(null);
    }
  };

  return { handleApply, loadingAction };
};

const TaskStatusCascadeModalContent = ({
  onApply,
  onCancel,
  subtasks,
  targetStatus,
}: TaskStatusCascadeModalContentProps) => {
  const { t } = useTranslation('chat');
  const { close, setCanDismissByClickOutside } = useModalContext();
  const { handleApply, loadingAction } = useCascadeApply(onApply);

  useEffect(() => {
    setCanDismissByClickOutside(!loadingAction);
  }, [loadingAction, setCanDismissByClickOutside]);

  useEffect(() => {
    if (!loadingAction) return;
    const preventEscapeDismiss = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener('keydown', preventEscapeDismiss, true);
    return () => window.removeEventListener('keydown', preventEscapeDismiss, true);
  }, [loadingAction]);

  const handleCancel = () => {
    onCancel();
    close();
  };

  return (
    <div className="flex flex-col">
      <div className={`flex flex-col gap-2 ${styles.content}`}>
        <h3 className="font-bold">{t('taskDetail.statusCascade.title')}</h3>
        <div style={{ color: cssVar.colorTextSecondary }}>
          {t('taskDetail.statusCascade.description', {
            count: subtasks.length,
            status: t(`taskDetail.status.${targetStatus}`),
          })}
        </div>
        <ScrollArea className={styles.list}>
          {subtasks.map((task) => {
            const status = task.status as TaskStatus | undefined;
            const meta = status ? STATUS_META[status] : STATUS_META.backlog;

            const StatusIcon = meta.icon;
            return (
              <div className={`flex items-center gap-2.5 ${styles.row}`} key={task.identifier}>
                <StatusIcon color={meta.color} size={16} />
                <div className="flex flex-col flex-1">
                  <div className="truncate block">{task.name || task.identifier}</div>
                </div>
                <div style={{ color: cssVar.colorTextTertiary }}>
                  {t(`taskDetail.status.${status ?? 'backlog'}`, { defaultValue: meta.label })}
                </div>
              </div>
            );
          })}
        </ScrollArea>
      </div>
      <div className={`flex items-center justify-between gap-2 ${styles.actions}`}>
        <Button disabled={!!loadingAction} onClick={handleCancel}>
          {t('taskDetail.statusCascade.cancel')}
        </Button>
        <div className="flex gap-2">
          <Button
            disabled={!!loadingAction}
            loading={loadingAction === 'parent'}
            onClick={() => void handleApply(false)}
          >
            {t('taskDetail.statusCascade.parentOnly')}
          </Button>
          <Button
            disabled={!!loadingAction}
            loading={loadingAction === 'all'}
            variant="default"
            onClick={() => void handleApply(true)}
          >
            {t('taskDetail.statusCascade.updateAll')}
          </Button>
        </div>
      </div>
    </div>
  );
};

interface CreateTaskStatusCascadeModalOptions {
  onApply: (includeSubtasks: boolean) => Promise<void>;
  subtasks: TaskStatusCascadeItem[];
  targetStatus: TaskStatus;
}

export const createTaskStatusCascadeModal = ({
  onApply,
  subtasks,
  targetStatus,
}: CreateTaskStatusCascadeModalOptions): Promise<boolean> =>
  new Promise((resolve) => {
    let applied = false;
    createModal({
      content: (
        <TaskStatusCascadeModalContent
          subtasks={subtasks}
          targetStatus={targetStatus}
          onCancel={() => resolve(false)}
          onApply={async (includeSubtasks) => {
            await onApply(includeSubtasks);
            applied = true;
            resolve(true);
          }}
        />
      ),
      maskClosable: true,
      footer: null,
      onOpenChangeComplete: (open) => {
        if (!open && !applied) resolve(false);
      },
      styles: { content: { padding: 0 } },
      title: false,
      width: 'min(92vw, 620px)',
    });
  });
