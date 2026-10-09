'use client';

import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import { memo, type ReactNode } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import AssigneeAvatar from '@/features/AgentTasks/features/AssigneeAvatar';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

const styles = createStaticStyles(({ css, cssVar }) => ({
  banner: css`
    position: relative;
    overflow: hidden;
    height: 60px;
  `,
  bannerInner: css`
    filter: blur(44px);
  `,
  clickableAvatar: css`
    cursor: pointer;
  `,
  clickableTitle: css`
    cursor: pointer;

    &:hover {
      color: ${cssVar.colorPrimary};
    }
  `,
  container: css`
    overflow: hidden;
    width: 280px;
    background: ${cssVar.colorBgElevated};
  `,
  description: css`
    overflow: hidden;

    max-height: 80px;

    font-size: 12px;
    line-height: 1.5;
    color: ${cssVar.colorTextSecondary};
    text-overflow: ellipsis;
  `,
  descriptionSkeleton: css`
    .ant-skeleton-paragraph {
      margin-block-start: 4px !important;
    }

    .ant-skeleton-paragraph > li {
      height: 12px !important;
    }

    .ant-skeleton-paragraph > li + li {
      margin-block-start: 6px !important;
    }
  `,
  header: css`
    position: relative;
    margin-block-start: -24px;
    padding-inline: 16px;
  `,
  name: css`
    font-size: 16px;
    font-weight: 600;
    color: ${cssVar.colorText};
  `,
}));

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
        <div
          className={`flex flex-col items-center justify-center ${styles.banner}`}
          style={{ background: cssVar.colorFillTertiary }}
        >
          <span className={styles.bannerInner}>
            <AssigneeAvatar agentId={agentId} size={400} />
          </span>
        </div>

        <div className={`flex flex-col gap-2 ${styles.header}`}>
          <span
            className={onHeaderClick ? styles.clickableAvatar : undefined}
            style={{ border: `2px solid ${cssVar.colorBgElevated}` }}
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
