'use client';

import { ActionIcon } from '@lobehub/ui/base-ui';
import { HotkeyEnum } from '@orvilo/const/hotkeys';
import { SearchIcon, SquarePenIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { createTaskModal } from '@/features/AgentTasks/CreateTaskModal';
import SideBarHeaderLayout from '@/features/NavPanel/SideBarHeaderLayout';
import { useGlobalStore } from '@/store/global';
import { useUserStore } from '@/store/user';
import { settingsSelectors } from '@/store/user/selectors';

import User from './components/User';

const roundActionStyle = { borderRadius: 9999 } as const;

/** Linear's header row: workspace/user switcher on the left, quick search and
 * new-issue compose icons on the right. The Inbox row carries its own unread
 * count, so the bell entry from the pre-convergence header is gone. */
const HeaderActions = memo(() => {
  const { t } = useTranslation('common');
  const toggleCommandMenu = useGlobalStore((s) => s.toggleCommandMenu);
  const commandPaletteHotkey = useUserStore(
    settingsSelectors.getHotkeyById(HotkeyEnum.CommandPalette),
  );
  const createTaskHotkey = useUserStore(settingsSelectors.getHotkeyById(HotkeyEnum.CreateTask));

  return (
    <>
      <ActionIcon
        aria-label={t('tab.search')}
        icon={SearchIcon}
        size={'small'}
        style={roundActionStyle}
        title={t('tab.search')}
        tooltipProps={{ hotkey: commandPaletteHotkey }}
        onClick={() => toggleCommandMenu(true)}
      />
      <ActionIcon
        aria-label={t('navPanel.newTask')}
        icon={SquarePenIcon}
        size={'small'}
        style={roundActionStyle}
        title={t('navPanel.newTask')}
        tooltipProps={{ hotkey: createTaskHotkey }}
        onClick={() => createTaskModal()}
      />
    </>
  );
});

const Header = () => {
  return <SideBarHeaderLayout left={<User />} right={<HeaderActions />} showBack={false} />;
};

export default Header;
