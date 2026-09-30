'use client';

import { createStaticStyles, cx } from 'antd-style';
import { ChevronRightIcon, HomeIcon } from 'lucide-react';
import type { MouseEvent, ReactNode } from 'react';
import { Fragment, memo } from 'react';
import { flushSync } from 'react-dom';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
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

interface BreadcrumbItem {
  href?: string;
  onClick?: (event: MouseEvent) => void;
  title: ReactNode;
}

interface SideBarHeaderLayoutProps {
  backTo?: string;
  breadcrumb?: BreadcrumbItem[];
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
      <div
        className="flex flex-row items-center flex-1 gap-0.5"
        style={{
          overflow: 'hidden',
        }}
      >
        {showBack && <BackButton size={DESKTOP_HEADER_ICON_SMALL_SIZE} to={backTo} />}
        {left && typeof left === 'string' ? (
          <div className="truncate text-[16px] font-medium">{left}</div>
        ) : (
          left
        )}
      </div>
    ) : (
      <div className="flex flex-col flex-1 px-[6px]">
        <Breadcrumb className={styles.breadcrumb}>
          <BreadcrumbList>
            {[
              homeItem ?? {
                href: '/',
                title: (
                  <span className="anticon" role="img">
                    <HomeIcon fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
                  </span>
                ),
              },
              ...breadcrumb,
            ].map((item, index, all) => (
              <Fragment key={index}>
                <BreadcrumbItem>
                  <BreadcrumbLink
                    href={item.href}
                    onClick={(event) => {
                      item.onClick?.(event);
                      if (isModifierClick(event)) return;
                      const href = item.href;
                      if (href) {
                        event.preventDefault();
                        event.stopPropagation();
                        // eslint-disable-next-line @eslint-react/dom/no-flush-sync
                        flushSync(() => navigate(href));
                      }
                    }}
                  >
                    {item.title}
                  </BreadcrumbLink>
                </BreadcrumbItem>
                {index < all.length - 1 && (
                  <BreadcrumbSeparator>
                    <span className="anticon" role="img">
                      <ChevronRightIcon
                        fill={'transparent'}
                        height={'1em'}
                        size={'1em'}
                        width={'1em'}
                      />
                    </span>
                  </BreadcrumbSeparator>
                )}
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    );

    return (
      <div
        className={cx('flex flex-row items-center flex-none justify-between', styles.container)}
        style={{ padding: '8px 6px' }}
      >
        {leftContent}
        <div className="flex flex-row items-center gap-0.5 justify-end">{right}</div>
      </div>
    );
  },
);

export default SideBarHeaderLayout;
