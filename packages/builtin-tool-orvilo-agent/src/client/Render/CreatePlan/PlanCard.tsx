'use client';
import { Markdown } from '@lobehub/ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import { ListChecksIcon } from 'lucide-react';
import { memo } from 'react';

import { useChatStore } from '@/store/chat';

import type { Plan } from '../../../types';

const MAX_CONTENT_HEIGHT = 100;

const styles = createStaticStyles(({ css, cssVar }) => ({
  content: css`
    overflow: hidden auto;

    max-height: ${MAX_CONTENT_HEIGHT}px;
    padding: 12px;
    border-radius: ${cssVar.borderRadius};

    background: ${cssVar.colorFillQuaternary};
  `,
  header: css`
    cursor: pointer;
    padding-block: 4px;
    padding-inline: 0;
    transition: opacity 0.2s;

    &:hover {
      opacity: 0.8;
    }
  `,
}));

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
        background: cssVar.colorBgContainer,
        border: `1px solid ${cssVar.colorBorderSecondary}`,
        borderRadius: cssVar.borderRadius,
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
