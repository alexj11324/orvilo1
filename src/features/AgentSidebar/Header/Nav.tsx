'use client';

import { ListTodoIcon, SearchIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceSlug } from '@/business/client/hooks/useActiveWorkspaceSlug';
import { appNavigate } from '@/features/Electron/navigation/appNavigate';
import NavItem from '@/features/NavPanel/components/NavItem';
import { buildWorkspaceAwarePath } from '@/features/Workspace/workspaceAwarePath';
import { useActiveLocation } from '@/hooks/useActiveLocation';
import { useGlobalStore } from '@/store/global';
import { isModifierClick } from '@/utils/navigation';

const Nav = () => {
  const { t } = useTranslation(['chat', 'common']);
  const activeSlug = useActiveWorkspaceSlug();
  const issuesHref = buildWorkspaceAwarePath('/tasks', activeSlug);
  const { pathname } = useActiveLocation();
  const toggleCommandMenu = useGlobalStore((s) => s.toggleCommandMenu);

  return (
    <div className="flex flex-col gap-[1px]" style={{ paddingInline: 4 }}>
      <NavItem
        active={pathname === issuesHref}
        href={issuesHref}
        icon={ListTodoIcon}
        title={t('common:tab.issues')}
        onClick={(event) => {
          if (!isModifierClick(event)) appNavigate(issuesHref, { escape: true });
        }}
      />
      <NavItem icon={SearchIcon} title={t('tab.search')} onClick={() => toggleCommandMenu(true)} />
    </div>
  );
};

export default Nav;
