'use client';

import { type TabBarProps } from '@lobehub/ui/mobile';
import { cn } from 'cn';
import { Inbox, MessageSquare, SquareUser, User } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useActiveTabKey } from '@/hooks/useActiveTabKey';
import { SidebarTabKey } from '@/store/global/initialState';

import navGeometry from './NavBar.module.css';

const styles = {
  active: '[&_svg]:fill-[color-mix(in_srgb,var(--primary)_33%,transparent)]',
  container: cn(
    'fixed z-100 inset-be-0 inset-x-0 box-border w-full select-none overflow-hidden border-t border-divider bg-background h-(--mobile-nav-height) pbe-(--mobile-nav-safe-area-bottom)',
    navGeometry.container,
  ),
};

const NavBar = memo(() => {
  const { t } = useTranslation('common');
  const activeKey = useActiveTabKey();
  const navigate = useWorkspaceAwareNavigate();

  // Chat stays reachable. Inbox is the work-attention tab: native banners,
  // the desktop bell, and this bar all land on `/inbox`.
  const items: TabBarProps['items'] = useMemo(
    () =>
      [
        {
          icon: (active: boolean) => (
            <MessageSquare className={cn('size-4', active && styles.active)} />
          ),
          key: SidebarTabKey.Chat,
          onClick: () => {
            navigate('/agent');
          },
          title: t('tab.chat'),
        },
        {
          icon: (active: boolean) => <Inbox className={cn('size-4', active && styles.active)} />,
          key: SidebarTabKey.Inbox,
          onClick: () => {
            navigate('/inbox');
          },
          title: t('tab.inbox'),
        },
        {
          icon: (active: boolean) => (
            <SquareUser className={cn('size-4', active && styles.active)} />
          ),
          key: SidebarTabKey.MyWork,
          onClick: () => {
            navigate('/my-issues');
          },
          title: t('tab.myWork'),
        },
        {
          icon: (active: boolean) => <User className={cn('size-4', active && styles.active)} />,
          key: SidebarTabKey.Me,
          onClick: () => {
            navigate('/me', { escape: true });
          },
          title: t('tab.me'),
        },
      ] as TabBarProps['items'],
    [navigate, t],
  );

  return (
    <footer className={styles.container}>
      <div className="flex h-full items-center justify-around">
        {items.map((item) => {
          const active = item.key === activeKey;
          return (
            <Button
              aria-current={active ? 'page' : undefined}
              key={item.key}
              size="large"
              type="button"
              variant="ghost"
              className={cn(
                'min-w-0 flex-1 flex-col gap-0 px-1 pointer-coarse:min-h-11 font-normal text-foreground-description hover:text-foreground',
                active && 'bg-selected text-primary-text hover:bg-selected hover:text-primary-text',
              )}
              onClick={item.onClick}
            >
              {typeof item.icon === 'function' ? item.icon(active) : item.icon}
              <span className="w-full truncate text-sm leading-5.5">
                {typeof item.title === 'function' ? item.title(active) : item.title}
              </span>
            </Button>
          );
        })}
      </div>
    </footer>
  );
});

NavBar.displayName = 'NavBar';

export default NavBar;
