'use client';

import { type TabBarProps } from '@lobehub/ui/mobile';
import { TabBar } from '@lobehub/ui/mobile';
import { createStaticStyles } from 'antd-style';
import { Inbox, MessageSquare, SquareUser, User } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { MOBILE_TABBAR_HEIGHT } from '@/const/layoutTokens';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useActiveTabKey } from '@/hooks/useActiveTabKey';
import { SidebarTabKey } from '@/store/global/initialState';

const styles = createStaticStyles(({ css, cssVar }) => ({
  active: css`
    svg {
      fill: color-mix(in srgb, ${cssVar.colorPrimary} 33%, transparent);
    }
  `,
  container: css`
    position: fixed;
    z-index: 100;
    inset-block-end: 0;
    inset-inline: 0;
  `,
}));

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
            <MessageSquare className={active ? styles.active : undefined} />
          ),
          key: SidebarTabKey.Chat,
          onClick: () => {
            navigate('/agent');
          },
          title: t('tab.chat'),
        },
        {
          icon: (active: boolean) => <Inbox className={active ? styles.active : undefined} />,
          key: SidebarTabKey.Inbox,
          onClick: () => {
            navigate('/inbox');
          },
          title: t('tab.inbox'),
        },
        {
          icon: (active: boolean) => <SquareUser className={active ? styles.active : undefined} />,
          key: SidebarTabKey.MyWork,
          onClick: () => {
            navigate('/my-issues');
          },
          title: t('tab.myWork'),
        },
        {
          icon: (active: boolean) => <User className={active ? styles.active : undefined} />,
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
    <TabBar
      safeArea
      activeKey={activeKey}
      className={styles.container}
      height={MOBILE_TABBAR_HEIGHT}
      items={items}
    />
  );
});

NavBar.displayName = 'NavBar';

export default NavBar;
