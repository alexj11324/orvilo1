'use client';

import { ChevronRightIcon, HomeIcon } from 'lucide-react';
import type { MouseEvent, ReactNode } from 'react';
import { Fragment, memo } from 'react';
import { flushSync } from 'react-dom';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { isModifierClick } from '@/utils/navigation';

import BackButton from './components/BackButton';

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
    const homeCrumb: BreadcrumbItem = homeItem ?? {
      href: '/',
      title: (
        <span className="anticon" role="img">
          <HomeIcon fill="transparent" size={16} />
        </span>
      ),
    };
    const leftContent = left ? (
      <div className="flex flex-1 flex-row items-center gap-0.5 overflow-hidden">
        {showBack && (
          <BackButton
            size={{ blockSize: 24, borderRadius: 'var(--radius-input)', size: 14 }}
            to={backTo}
          />
        )}
        {left && typeof left === 'string' ? (
          <div className="truncate text-base font-medium">{left}</div>
        ) : (
          left
        )}
      </div>
    ) : (
      <div className="flex flex-col flex-1 px-1.5">
        <Breadcrumb>
          <BreadcrumbList className="text-sm text-foreground-description">
            {[homeCrumb, ...breadcrumb].map((item, index, all) => (
              <Fragment key={index}>
                <BreadcrumbItem>
                  {item.href ? (
                    <BreadcrumbLink
                      className="flex items-center text-foreground-description hover:text-foreground"
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
                  ) : (
                    <BreadcrumbPage>{item.title}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
                {index < all.length - 1 && (
                  <BreadcrumbSeparator>
                    <span className="anticon" role="img">
                      <ChevronRightIcon fill="transparent" size={14} />
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
      <div className="flex flex-none flex-row items-center justify-between overflow-hidden px-1.5 py-2">
        {leftContent}
        <div className="flex flex-row items-center gap-0.5 justify-end">{right}</div>
      </div>
    );
  },
);

export default SideBarHeaderLayout;
