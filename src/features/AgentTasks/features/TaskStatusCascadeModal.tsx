'use client';

import { UNFINISHED_TASK_STATUSES } from '@orvilo/builtin-tool-task';
import type { TaskStatus } from '@orvilo/types';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { createModal, useModalContext } from '@/components/Modal';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

import { STATUS_META } from './taskStatusMeta';

const styles = {
  actions: 'p-4 border-bs border-divider',
  content: 'pbs-5 pbe-4 px-5 text-sm leading-5.5',
  list: 'max-h-70 mbs-2 border border-divider rounded-(--radius-card)',
  row: 'py-1.5 px-3 [&:not(:last-child)]:border-be [&:not(:last-child)]:border-divider',
};

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

const UNFINISHED_SUBTASK_STATUSES = new Set<TaskStatus>(UNFINISHED_TASK_STATUSES);

/** Subtasks still open — the only ones a done/cancel cascade can touch. */
export const getOpenSubtasks = (subtasks: TaskStatusCascadeItem[]): TaskStatusCascadeItem[] =>
  subtasks.filter((task) => UNFINISHED_SUBTASK_STATUSES.has(task.status as TaskStatus));

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
        <h3 className="text-base leading-6 font-semibold">{t('taskDetail.statusCascade.title')}</h3>
        <div className="text-sm leading-5.5 text-muted-foreground">
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
                <div className="text-xs leading-5 text-muted-foreground">
                  {t(`taskDetail.status.${status ?? 'backlog'}`, { defaultValue: meta.label })}
                </div>
              </div>
            );
          })}
        </ScrollArea>
      </div>
      <div className={`flex flex-wrap items-center justify-between gap-2 ${styles.actions}`}>
        <Button disabled={!!loadingAction} size="lg" variant="ghost" onClick={handleCancel}>
          {t('taskDetail.statusCascade.cancel')}
        </Button>
        <div className="ms-auto flex flex-wrap justify-end gap-2">
          <Button
            disabled={!!loadingAction}
            loading={loadingAction === 'parent'}
            size="lg"
            variant="outline"
            onClick={() => void handleApply(false)}
          >
            {t('taskDetail.statusCascade.parentOnly')}
          </Button>
          <Button
            disabled={!!loadingAction}
            loading={loadingAction === 'all'}
            size="lg"
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
