'use client';

import { HotkeyEnum } from '@orvilo/const/hotkeys';
import { SearchIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import SideBarHeaderLayout from '@/features/NavPanel/SideBarHeaderLayout';
import { useGlobalStore } from '@/store/global';
import { useUserStore } from '@/store/user';
import { settingsSelectors } from '@/store/user/selectors';

import User from './components/User';

const roundActionStyle = { borderRadius: 9999 } as const;

/** Workspace switcher and search; creation belongs to the destination page. */
const HeaderActions = memo(() => {
  const { t } = useTranslation('common');
  const toggleCommandMenu = useGlobalStore((s) => s.toggleCommandMenu);
  const commandPaletteHotkey = useUserStore(
    settingsSelectors.getHotkeyById(HotkeyEnum.CommandPalette),
  );

  return (
    <>
      <ActionIcon
        icon={SearchIcon}
        size={'small'}
        style={roundActionStyle}
        title={t('tab.search')}
        tooltipProps={{ hotkey: commandPaletteHotkey }}
        onClick={() => toggleCommandMenu(true)}
      />
    </>
  );
});

const Header = () => {
  return <SideBarHeaderLayout left={<User />} right={<HeaderActions />} showBack={false} />;
};

export default Header;
