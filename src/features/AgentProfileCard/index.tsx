'use client';

import { cn } from 'cn';
import { memo, type ReactNode } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import AssigneeAvatar from '@/features/AgentTasks/features/AssigneeAvatar';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

const styles = {
  banner: 'relative overflow-hidden h-15 bg-muted',
  bannerInner: '[filter:blur(44px)]',
  clickableAvatar: 'cursor-pointer',
  clickableTitle: 'cursor-pointer hover:text-primary-text',
  container: 'overflow-hidden w-70 bg-popover',
  description: 'overflow-hidden max-h-20 text-sm leading-5.5 text-muted-foreground text-ellipsis',
  descriptionSkeleton: '',
  header: 'relative [margin-block-start:-24px] px-4',
  name: 'text-base leading-6 font-semibold text-foreground',
};

export interface AgentProfileCardProps {
  agentId: string;
  children?: ReactNode;
  description?: string | null;
  headerAction?: ReactNode;
  /** Show inline skeletons for fields that are still loading. */
  loading?: boolean;
  /** When set, avatar + title become clickable and trigger this handler. */
  onHeaderClick?: () => void;
  title: string;
}

const AgentProfileCard = memo<AgentProfileCardProps>(
  ({ agentId, description, headerAction, loading, onHeaderClick, title, children }) => {
    return (
      <div className={`flex flex-col ${styles.container}`}>
        <div className={`flex flex-col items-center justify-center ${styles.banner}`}>
          <span className={styles.bannerInner}>
            <AssigneeAvatar agentId={agentId} size={400} />
          </span>
        </div>

        <div className={`flex flex-col gap-2 ${styles.header}`}>
          <span
            className={cn('border-2 border-popover', onHeaderClick && styles.clickableAvatar)}
            onClick={onHeaderClick}
          >
            <AssigneeAvatar agentId={agentId} size={48} />
          </span>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between">
              <div
                {...clickableProps()}
                className={cn(
                  cn(
                    'truncate',
                    'block',
                    `${styles.name} ${onHeaderClick ? styles.clickableTitle : ''}`,
                  ),
                  CLICKABLE_FOCUS_RING,
                )}
                onClick={onHeaderClick}
              >
                {title}
              </div>
              {headerAction}
            </div>
            {description ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span>
                      <div className={cn('line-clamp-2', styles.description)}>{description}</div>
                    </span>
                  }
                />
                <TooltipContent>{description}</TooltipContent>
              </Tooltip>
            ) : loading ? (
              <div className={cn('flex flex-col gap-2', styles.descriptionSkeleton)}>
                <Skeleton />
                <Skeleton style={{ width: '60%' }} />
              </div>
            ) : null}
          </div>
        </div>

        {children}
      </div>
    );
  },
);

export default AgentProfileCard;
