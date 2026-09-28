'use client';

import { Flexbox } from '@lobehub/ui';
import { HeartPulseIcon, SearchIcon } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { type NavItemProps } from '@/features/NavPanel/components/NavItem';
import NavItem from '@/features/NavPanel/components/NavItem';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useGlobalStore } from '@/store/global';
import { isModifierClick } from '@/utils/navigation';

interface Item {
  icon: NavItemProps['icon'];
  key: string;
  onClick?: () => void;
  title: NavItemProps['title'];
  url?: string;
}

/**
 * One entry per layer used to sit here — home, identities, contexts,
 * preferences, experiences, activities. Every layer but the preferences manager
 * has been retired, and what is left is the user's own control over what was
 * remembered from their conversations, plus the palette.
 */
const Nav = memo(() => {
  const navigate = useWorkspaceAwareNavigate();
  const { t } = useTranslation('memory');
  const toggleCommandMenu = useGlobalStore((s) => s.toggleCommandMenu);

  const items: Item[] = useMemo(
    () => [
      {
        icon: SearchIcon,
        key: 'search',
        onClick: () => {
          toggleCommandMenu(true);
        },
        title: t('tab.search'),
      },
      {
        icon: HeartPulseIcon,
        key: 'preferences',
        title: t('tab.preferences'),
        url: '/memory/preferences',
      },
    ],
    [t],
  );

  return (
    <Flexbox gap={1} paddingInline={4}>
      {items.map((item) => {
        const url = item.url;
        if (!url) {
          return (
            <NavItem icon={item.icon} key={item.key} title={item.title} onClick={item.onClick} />
          );
        }

        return (
          <Link
            key={item.key}
            to={url}
            onClick={(e) => {
              if (isModifierClick(e)) return;
              e.preventDefault();
              navigate(url);
            }}
          >
            <NavItem active icon={item.icon} title={item.title} />
          </Link>
        );
      })}
    </Flexbox>
  );
});

export default Nav;
