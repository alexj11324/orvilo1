'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme as useNextThemesTheme } from 'next-themes';
import { createElement, memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const themeIcons = {
  dark: Moon,
  light: Sun,
  system: Monitor,
} as const;

const AuthThemeButton = memo<{ size?: number }>((props) => {
  const { t: tCommon } = useTranslation('common');
  const { setTheme, theme } = useNextThemesTheme();

  const items = useMemo(
    () => [
      {
        icon: createElement(themeIcons.system, { size: 16 }),
        key: 'system',
        label: 'Auto',
        onClick: () => setTheme('system'),
      },
      {
        icon: createElement(themeIcons.light, { size: 16 }),
        key: 'light',
        label: 'Light',
        onClick: () => setTheme('light'),
      },
      {
        icon: createElement(themeIcons.dark, { size: 16 }),
        key: 'dark',
        label: 'Dark',
        onClick: () => setTheme('dark'),
      },
    ],
    [setTheme],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <ActionIcon
            aria-label={tCommon('theme')}
            className="relative pointer-coarse:after:absolute pointer-coarse:after:left-1/2 pointer-coarse:after:top-1/2 pointer-coarse:after:-translate-x-1/2 pointer-coarse:after:-translate-y-1/2 pointer-coarse:after:h-[calc(100%+var(--spacing)*0.5)] pointer-coarse:after:w-[calc(100%+var(--spacing)*0.5)] pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11 pointer-coarse:after:content-['']"
            icon={themeIcons[(theme as 'dark' | 'light' | 'system') || 'system']}
            size={props.size || { blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
          />
        }
      />
      <DropdownMenuContent align="start" side="bottom">
        {items.map((item) => (
          <DropdownMenuItem
            className="min-h-9 rounded-(--radius-button) pointer-coarse:min-h-11"
            key={item.key}
            onClick={item.onClick}
          >
            {item.icon}
            <span className="min-w-0 flex-1 text-sm leading-5.5">{item.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

AuthThemeButton.displayName = 'AuthThemeButton';

export default AuthThemeButton;
