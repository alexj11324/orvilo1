'use client';

import { ActionIcon } from '@lobehub/ui/base-ui';
import { SearchIcon, SquarePenIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { createTaskModal } from '@/features/AgentTasks/CreateTaskModal';
import SideBarHeaderLayout from '@/features/NavPanel/SideBarHeaderLayout';
import { useGlobalStore } from '@/store/global';

import User from './components/User';

/** Linear's header row: workspace/user switcher on the left, quick search and
 * new-issue compose icons on the right. The Inbox row carries its own unread
 * count, so the bell entry from the pre-convergence header is gone. */
const HeaderActions = memo(() => {
  const { t } = useTranslation('common');
  const toggleCommandMenu = useGlobalStore((s) => s.toggleCommandMenu);

  return (
    <>
      <ActionIcon
        icon={SearchIcon}
        size={'small'}
        title={t('tab.search')}
        onClick={() => toggleCommandMenu(true)}
      />
      <ActionIcon
        icon={SquarePenIcon}
        size={'small'}
        title={t('navPanel.newTask')}
        onClick={() => createTaskModal()}
      />
    </>
  );
});

const Header = () => {
  return <SideBarHeaderLayout left={<User />} right={<HeaderActions />} showBack={false} />;
};

export default Header;
