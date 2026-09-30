'use client';

import { Avatar, Skeleton, Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { memo, type ReactNode } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DEFAULT_AVATAR } from '@/const/meta';

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
  avatar?: string | null;
  backgroundColor?: string | null;
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
  ({
    avatar,
    backgroundColor,
    description,
    headerAction,
    loading,
    onHeaderClick,
    title,
    children,
  }) => {
    return (
      <div className={`flex flex-col ${styles.container}`}>
        <div
          className={`flex items-center justify-center ${styles.banner}`}
          style={{ background: cssVar.colorFillTertiary }}
        >
          <Avatar
            emojiScaleWithBackground
            avatar={avatar || DEFAULT_AVATAR}
            background={backgroundColor ?? undefined}
            className={styles.bannerInner}
            shape={'square'}
            size={400}
          />
        </div>

        <div className={`flex flex-col gap-2 ${styles.header}`}>
          <Avatar
            emojiScaleWithBackground
            avatar={avatar || DEFAULT_AVATAR}
            background={backgroundColor ?? undefined}
            className={onHeaderClick ? styles.clickableAvatar : undefined}
            shape={'square'}
            size={48}
            style={{ border: `2px solid ${cssVar.colorBgElevated}` }}
            onClick={onHeaderClick}
          />
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between">
              <Text
                ellipsis
                className={`${styles.name} ${onHeaderClick ? styles.clickableTitle : ''}`}
                onClick={onHeaderClick}
              >
                {title}
              </Text>
              {headerAction}
            </div>
            {description ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span>
                      <Text className={styles.description} ellipsis={{ rows: 2 }}>
                        {description}
                      </Text>
                    </span>
                  }
                />
                <TooltipContent>{description}</TooltipContent>
              </Tooltip>
            ) : loading ? (
              <Skeleton.Text
                className={styles.descriptionSkeleton}
                rows={2}
                width={['100%', '60%']}
              />
            ) : null}
          </div>
        </div>

        {children}
      </div>
    );
  },
);

export default AgentProfileCard;
