'use client';
import { Markdown } from '@lobehub/ui';
import { cn } from 'cn';
import { ListChecksIcon } from 'lucide-react';
import { memo } from 'react';

import { useChatStore } from '@/store/chat';

import type { Plan } from '../../../types';

const styles = {
  content:
    'max-h-[100px] overflow-x-hidden overflow-y-auto rounded-(--ant-border-radius) bg-(--ant-color-fill-quaternary) p-3',
  header: 'cursor-pointer px-0 py-1 transition-opacity duration-200 ease-[ease] hover:opacity-80',
};

interface PlanCardProps {
  plan: Plan;
}

const PlanCard = memo<PlanCardProps>(({ plan }) => {
  const openDocument = useChatStore((s) => s.openDocument);

  const handleHeaderClick = () => {
    openDocument(plan.id);
  };

  const hasContext = !!plan.context;

  return (
    <div
      className="flex flex-col gap-2 p-3"
      style={{
        overflow: 'hidden',
        background: 'var(--card)',
        border: `1px solid var(--sidebar-border)`,
        borderRadius: 'var(--ant-border-radius)',
      }}
    >
      {/* Header - clickable to open document */}
      <div
        className={cn('flex', 'items-center', 'gap-2', styles.header)}
        style={{ overflow: 'hidden' }}
        onClick={handleHeaderClick}
      >
        <ListChecksIcon size={18} />
        <div className="truncate text-[16px] font-medium">{plan.goal}</div>
      </div>

      {/* Description */}
      {plan.description && (
        <div className="line-clamp-2 text-[14px] text-muted-foreground">{plan.description}</div>
      )}

      {/* Context content */}
      {hasContext && (
        <div className={styles.content}>
          <Markdown fontSize={13} variant={'chat'}>
            {plan.context!}
          </Markdown>
        </div>
      )}
    </div>
  );
});

export default PlanCard;
