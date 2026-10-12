'use client';

import { cn } from 'cn';
import { Plus } from 'lucide-react';
import { type ReactNode } from 'react';
import { memo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from 'react-responsive';

import Avatar from '@/components/Avatar';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { SidebarMenuItems } from '@/features/NavPanel/components/SidebarDropdownMenu';
import SidebarDropdownMenu from '@/features/NavPanel/components/SidebarDropdownMenu';
import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/selectors';

const styles = {
  addButton:
    'w-8 p-0 border-0 text-foreground-tertiary bg-transparent transition-colors duration-(--orvilo-motion-mid) hover:text-muted-foreground hover:bg-accent motion-reduce:transition-none',
  addButtonDisabled:
    'cursor-not-allowed text-foreground-quaternary hover:text-foreground-quaternary hover:bg-transparent',
  container: 'flex gap-0.5 items-center',
  externalTag: 'shrink-0 py-0.25 px-1 rounded-(--radius-chip) text-xs leading-5 bg-selected',
  tab: "gap-1.5 py-1 px-3 border-0 rounded-(--radius-button) font-normal text-foreground-tertiary bg-transparent transition-colors duration-(--orvilo-motion-mid) hover:text-muted-foreground hover:bg-accent motion-reduce:transition-none [&_svg:not([class*='size-'])]:size-auto",
  tabActive: 'text-foreground bg-selected hover:text-foreground hover:bg-selected',
  tabTitle: 'overflow-hidden max-w-30 text-sm leading-5.5 text-ellipsis whitespace-nowrap',
};

export interface ChromeTabItem {
  avatar?: string;
  icon?: ReactNode;
  id: string;
  isExternal?: boolean;
  title: string;
}

interface ChromeTabsProps {
  activeId: string;
  addDisabled?: boolean;
  addDisabledReason?: string;
  /**
   * When provided, the add button becomes a dropdown trigger showing these items.
   * Otherwise it falls back to calling `onAdd` directly on click.
   */
  addMenuItems?: SidebarMenuItems;
  items: ChromeTabItem[];
  onAdd?: () => void;
  onChange: (id: string) => void;
}

const ChromeTabs = memo<ChromeTabsProps>(
  ({ items, activeId, onChange, onAdd, addMenuItems, addDisabled, addDisabledReason }) => {
    const { t } = useTranslation('chat');
    const containerRef = useRef<HTMLDivElement>(null);
    const animationMode = useUserStore(userGeneralSettingsSelectors.animationMode);
    const prefersReducedMotion = useMediaQuery({ query: '(prefers-reduced-motion: reduce)' });
    const shouldAnimateScroll = animationMode !== 'disabled' && !prefersReducedMotion;

    useEffect(() => {
      if (!containerRef.current || !activeId) return;

      const activeTab = containerRef.current.querySelector(`[data-tab-id="${activeId}"]`);
      if (!activeTab) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const tabRect = activeTab.getBoundingClientRect();

      const isVisible = tabRect.left >= containerRect.left && tabRect.right <= containerRect.right;

      if (!isVisible) {
        activeTab.scrollIntoView({
          behavior: shouldAnimateScroll ? 'smooth' : 'instant',
          block: 'nearest',
          inline: 'nearest',
        });
      }
    }, [activeId, shouldAnimateScroll]);

    return (
      <div className={styles.container} ref={containerRef}>
        {items.map((item) => {
          const isActive = item.id === activeId;

          return (
            <Button
              aria-pressed={isActive}
              className={cn(styles.tab, isActive && styles.tabActive)}
              data-tab-id={item.id}
              key={item.id}
              size="compact"
              type="button"
              variant="ghost"
              onClick={() => onChange(item.id)}
            >
              <div className="flex items-center gap-1.5">
                {item.icon || (item.avatar ? <Avatar avatar={item.avatar} size={16} /> : null)}
                <span className={styles.tabTitle}>{item.title}</span>
                {item.isExternal && (
                  <span className={styles.externalTag}>{t('group.profile.external')}</span>
                )}
              </div>
            </Button>
          );
        })}
        {(addMenuItems || onAdd) &&
          (addMenuItems ? (
            addDisabled ? (
              <Button
                disabled
                aria-label={t('memberSelection.addMember')}
                className={cn(styles.addButton, styles.addButtonDisabled)}
                size="compact"
                title={addDisabledReason}
                type="button"
                variant="ghost"
              >
                <Plus className="size-4" size={16} />
              </Button>
            ) : (
              <SidebarDropdownMenu items={addMenuItems} placement="bottomLeft">
                <Button
                  aria-label={t('memberSelection.addMember')}
                  className={styles.addButton}
                  size="compact"
                  type="button"
                  variant="ghost"
                >
                  <Plus className="size-4" size={16} />
                </Button>
              </SidebarDropdownMenu>
            )
          ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span className="inline-flex">
                      <Button
                        aria-label={t('memberSelection.addMember')}
                        className={cn(styles.addButton, addDisabled && styles.addButtonDisabled)}
                        disabled={addDisabled}
                        size="compact"
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          if (addDisabled) return;
                          onAdd?.();
                        }}
                      >
                        <Plus className="size-4" size={16} />
                      </Button>
                    </span>
                  }
                />
                <TooltipContent>{addDisabled ? addDisabledReason : undefined}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))}
      </div>
    );
  },
);

export default ChromeTabs;
