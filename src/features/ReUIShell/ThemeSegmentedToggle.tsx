'use client';

import { cn } from 'cn';
import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

const THEMES = [
  { icon: SunIcon, labelKey: 'settingCommon.themeMode.light', value: 'light' },
  { icon: MoonIcon, labelKey: 'settingCommon.themeMode.dark', value: 'dark' },
  { icon: MonitorIcon, labelKey: 'settingCommon.themeMode.auto', value: 'system' },
] as const;

export function ThemeSegmentedToggle() {
  const { t } = useTranslation('setting');
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const currentTheme = mounted ? (theme ?? 'system') : 'system';

  return (
    <div
      aria-label={t('settingCommon.themeMode.title')}
      className="inline-flex items-center gap-0.5 rounded-(--radius-button) bg-muted/60 p-0.5"
      role="radiogroup"
    >
      {THEMES.map(({ value, labelKey, icon: ThemeIcon }) => {
        const isActive = currentTheme === value;
        return (
          <Button
            aria-checked={isActive}
            aria-label={t(labelKey)}
            key={value}
            role="radio"
            size="icon"
            type="button"
            variant="ghost"
            className={cn(
              'rounded-(--radius-button) [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11',
              isActive
                ? 'bg-background text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setTheme(value)}
          >
            <ThemeIcon aria-hidden className="size-4" />
          </Button>
        );
      })}
    </div>
  );
}
