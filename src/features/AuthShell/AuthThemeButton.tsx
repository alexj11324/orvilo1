'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme as useNextThemesTheme } from 'next-themes';
import { createElement, memo, useMemo } from 'react';

import ActionIcon from '@/components/ActionIcon';
import SidebarDropdownMenu, {
  type SidebarDropdownMenuProps,
} from '@/features/NavPanel/components/SidebarDropdownMenu';

const themeIcons = {
  dark: Moon,
  light: Sun,
  system: Monitor,
} as const;

const AuthThemeButton = memo<{ size?: number }>((props) => {
  const { setTheme, theme } = useNextThemesTheme();

  const items = useMemo<SidebarDropdownMenuProps['items']>(
    () => [
      {
        icon: createElement(themeIcons.system, { size: 14 }),
        key: 'system',
        label: 'Auto',
        onClick: () => setTheme('system'),
      },
      {
        icon: createElement(themeIcons.light, { size: 14 }),
        key: 'light',
        label: 'Light',
        onClick: () => setTheme('light'),
      },
      {
        icon: createElement(themeIcons.dark, { size: 14 }),
        key: 'dark',
        label: 'Dark',
        onClick: () => setTheme('dark'),
      },
    ],
    [setTheme],
  );

  return (
    <SidebarDropdownMenu items={items}>
      <ActionIcon
        icon={themeIcons[(theme as 'dark' | 'light' | 'system') || 'system']}
        size={props.size || { blockSize: 32, size: 16 }}
      />
    </SidebarDropdownMenu>
  );
});

AuthThemeButton.displayName = 'AuthThemeButton';

export default AuthThemeButton;
