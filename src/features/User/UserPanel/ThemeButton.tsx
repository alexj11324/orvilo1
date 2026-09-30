import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme as useNextThemesTheme } from 'next-themes';
import { createElement, type FC, type ReactElement, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { electronStylish } from '@/styles/electron';

const themeIcons = {
  dark: Moon,
  light: Sun,
  system: Monitor,
};

type ThemePlacement =
  'top' | 'topLeft' | 'topRight' | 'bottom' | 'bottomLeft' | 'bottomRight' | 'left' | 'right';

const ThemeButton: FC<{ placement?: ThemePlacement; size?: number }> = ({ placement, size }) => {
  const { setTheme, theme } = useNextThemesTheme();

  const { t } = useTranslation('setting');

  const items = useMemo<{ icon: ReactElement; key: string; label: string; onClick: () => void }[]>(
    () => [
      {
        icon: createElement(themeIcons.system),
        key: 'system',
        label: t('settingCommon.themeMode.auto'),
        onClick: () => setTheme('system'),
      },
      {
        icon: createElement(themeIcons.light),
        key: 'light',
        label: t('settingCommon.themeMode.light'),
        onClick: () => setTheme('light'),
      },
      {
        icon: createElement(themeIcons.dark),
        key: 'dark',
        label: t('settingCommon.themeMode.dark'),
        onClick: () => setTheme('dark'),
      },
    ],
    [setTheme, t],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <ActionIcon
            icon={themeIcons[(theme as 'dark' | 'light' | 'system') || 'system']}
            size={size || { blockSize: 32, size: 16 }}
          />
        }
      />
      <DropdownMenuContent
        className={electronStylish.nodrag}
        align={
          placement?.endsWith('Right') ? 'end' : placement?.endsWith('Left') ? 'start' : 'center'
        }
        side={
          placement?.startsWith('top')
            ? 'top'
            : placement?.startsWith('left')
              ? 'left'
              : placement?.startsWith('right')
                ? 'right'
                : 'bottom'
        }
      >
        {items.map((item) => (
          <DropdownMenuItem key={item.key} onClick={item.onClick}>
            {item.icon}
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ThemeButton;
