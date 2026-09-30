'use client';

import { Text } from '@lobehub/ui/base-ui';
import type { BreadcrumbProps } from 'antd';
import { Breadcrumb } from 'antd';
import { createStaticStyles, cx } from 'antd-style';
import { ChevronRightIcon, HomeIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { memo } from 'react';
import { flushSync } from 'react-dom';

import { DESKTOP_HEADER_ICON_SMALL_SIZE } from '@/const/layoutTokens';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { isModifierClick } from '@/utils/navigation';

import BackButton from './components/BackButton';

const prefixCls = 'ant';

const styles = createStaticStyles(({ css, cssVar }) => ({
  breadcrumb: css`
    ol {
      align-items: center;
    }
    .${prefixCls}-breadcrumb-separator {
      margin-inline: 4px;
    }
    .${prefixCls}-breadcrumb-link {
      display: flex !important;
      align-items: center !important;
      font-size: 12px;
      color: ${cssVar.colorTextDescription};
    }
    a.${prefixCls}-breadcrumb-link {
      &:hover {
        color: ${cssVar.colorText};
      }
    }
  `,
  container: css`
    overflow: hidden;
  `,
}));

type BreadcrumbItem = NonNullable<BreadcrumbProps['items']>[number];

interface SideBarHeaderLayoutProps {
  backTo?: string;
  breadcrumb?: BreadcrumbProps['items'];
  /** Override the leading home breadcrumb item (defaults to home icon → `/`). */
  homeItem?: BreadcrumbItem;
  left?: ReactNode;
  right?: ReactNode;
  showBack?: boolean;
}

const SideBarHeaderLayout = memo<SideBarHeaderLayoutProps>(
  ({ left, right, backTo = '/', showBack = true, breadcrumb = [], homeItem }) => {
    const navigate = useWorkspaceAwareNavigate();
    const leftContent = left ? (
      <div className="flex items-center flex-1 gap-0.5" style={{ overflow: 'hidden' }}>
        {showBack && <BackButton size={DESKTOP_HEADER_ICON_SMALL_SIZE} to={backTo} />}
        {left && typeof left === 'string' ? (
          <Text ellipsis fontSize={16} weight={500}>
            {left}
          </Text>
        ) : (
          left
        )}
      </div>
    ) : (
      <div className="flex flex-col flex-1 px-[6px]">
        <Breadcrumb
          className={styles.breadcrumb}
          separator={<ChevronRightIcon size={12} />}
          items={[
            homeItem ?? {
              href: '/',
              title: <HomeIcon size={16} />,
            },
            ...breadcrumb,
          ].map((item) => ({
            ...item,
            onClick: (event) => {
              if (isModifierClick(event)) return;
              const href = item.href;
              if (href) {
                event.preventDefault();
                event.stopPropagation();
                // eslint-disable-next-line @eslint-react/dom/no-flush-sync
                flushSync(() => navigate(href));
              }
            },
          }))}
        />
      </div>
    );

    return (
      <div
        className={cx(styles.container, 'flex items-center flex-none justify-between')}
        style={{ padding: '8px 6px' }}
      >
        {leftContent}
        <div className="flex items-center gap-0.5 justify-end">{right}</div>
      </div>
    );
  },
);

export default SideBarHeaderLayout;
