import { cssVar } from 'antd-style';
import { cn } from 'cn';
import { Check, ChevronDownIcon, ChevronUpIcon, MoreHorizontal, Trash } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { confirmModal } from '@/components/Modal';
import { toast } from '@/components/toast';
import BriefCardActions from '@/features/DailyBrief/BriefCardActions';
import BriefCardArtifacts from '@/features/DailyBrief/BriefCardArtifacts';
import BriefCardSummary from '@/features/DailyBrief/BriefCardSummary';
import BriefIcon from '@/features/DailyBrief/BriefIcon';
import { styles as briefStyles } from '@/features/DailyBrief/style';
import type { BriefItem } from '@/features/DailyBrief/types';
import Time from '@/features/Home/components/Time';
import SidebarDropdownMenu from '@/features/NavPanel/components/SidebarDropdownMenu';
import { useBriefStore } from '@/store/brief';

interface TaskBriefCardProps {
  brief: BriefItem;
  onAfterAddComment?: () => void | Promise<void>;
  onAfterDelete?: () => void | Promise<void>;
  onAfterResolve?: () => void | Promise<void>;
}

const TaskBriefCard = memo<TaskBriefCardProps>(
  ({ brief, onAfterResolve, onAfterAddComment, onAfterDelete }) => {
    const { t } = useTranslation('home');
    const deleteBrief = useBriefStore((s) => s.deleteBrief);
    const isResolved = Boolean(brief.resolvedAction);
    const [expanded, setExpanded] = useState(false);
    const showFull = !isResolved || expanded;

    const handleDelete = useCallback(() => {
      confirmModal({
        content: t('brief.deleteConfirm.content'),
        okButtonProps: { danger: true },
        okText: t('brief.deleteConfirm.ok'),
        onOk: async () => {
          try {
            await deleteBrief(brief.id);
          } catch (error) {
            // Same class as every other brief mutation: the tRPC client only
            // console.errors non-401 failures, so without this the modal just
            // closes and the row stays put with no explanation.
            toast.error((error as Error)?.message || t('brief.actionFailed'));
            return;
          }

          // The refresh runs after the delete has already landed — a rejection
          // here leaves the view stale, it does not mean the delete failed.
          try {
            await onAfterDelete?.();
          } catch (error) {
            console.error('[TaskBriefCard] post-delete refresh failed', error);
          }
        },
        title: t('brief.deleteConfirm.title'),
      });
    }, [brief.id, deleteBrief, onAfterDelete, t]);

    const menuItems = useMemo(
      () => [
        {
          danger: true,
          icon: <Trash />,
          key: 'delete',
          label: t('brief.delete'),
          onClick: handleDelete,
        },
      ],
      [handleDelete, t],
    );

    return (
      <div
        className={`flex flex-col gap-3 px-2 py-3 ${briefStyles.card}`}
        style={{
          border: `1px solid ${cssVar.colorBorder}`,
          borderRadius: cssVar.borderRadiusLG,
        }}
      >
        <div className="flex items-center gap-2" style={{ overflow: 'hidden' }}>
          <BriefIcon muted={isResolved} size={24} type={brief.type} />
          <div className="truncate block font-medium" style={{ flex: 1 }}>
            {brief.title}
          </div>
          {isResolved && !expanded && (
            <div className="flex items-center gap-1">
              <Check color={cssVar.colorTextQuaternary} size={14} />
              <div className={cn(briefStyles.resolvedTag)}>{t('brief.resolved')}</div>
            </div>
          )}
          <Time date={brief.createdAt} />
          {isResolved && (
            <ActionIcon
              icon={expanded ? ChevronUpIcon : ChevronDownIcon}
              size={'small'}
              title={expanded ? t('brief.collapse') : t('brief.expandAll')}
              onClick={() => setExpanded((v) => !v)}
            />
          )}
          <SidebarDropdownMenu items={menuItems}>
            <ActionIcon icon={MoreHorizontal} size={'small'} />
          </SidebarDropdownMenu>
        </div>
        {showFull && (
          <>
            <BriefCardSummary summary={brief.summary} />
            <BriefCardArtifacts artifacts={brief.artifacts} />
            <BriefCardActions
              actions={brief.actions}
              agentId={brief.agentId ?? brief.agent?.id}
              briefId={brief.id}
              briefType={brief.type}
              resolvedAction={brief.resolvedAction}
              taskId={brief.taskId}
              taskStatus={brief.taskStatus}
              topicId={brief.topicId}
              onAfterAddComment={onAfterAddComment}
              onAfterResolve={onAfterResolve}
            />
          </>
        )}
      </div>
    );
  },
);

export default TaskBriefCard;
