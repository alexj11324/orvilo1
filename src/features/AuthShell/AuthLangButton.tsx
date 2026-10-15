'use client';

import { GlobeIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ORVILO_LOCALE_COOKIE } from '@/const/locale';
import { localeOptions, normalizeLocale } from '@/locales/resources';

const setCookieSimple = (key: string, value: string, days: number) => {
  const expires = new Date(Date.now() + days * 86_400_000).toUTCString();
  document.cookie = `${key}=${value};expires=${expires};path=/;`;
};

const AuthLangButton = memo(() => {
  const { i18n } = useTranslation();
  const browserLanguage = typeof navigator !== 'undefined' ? navigator.language : 'en-US';
  const current = normalizeLocale(i18n.resolvedLanguage || i18n.language || browserLanguage);
  const currentLabel = localeOptions.find((item) => item.value === current)?.label || 'English';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            className="relative pointer-coarse:after:absolute pointer-coarse:after:left-1/2 pointer-coarse:after:top-1/2 pointer-coarse:after:-translate-x-1/2 pointer-coarse:after:-translate-y-1/2 pointer-coarse:after:h-[calc(100%+var(--spacing)*0.5)] pointer-coarse:after:w-[calc(100%+var(--spacing)*0.5)] pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11 pointer-coarse:after:content-[''] px-2"
            size="compact"
            type="button"
            variant="ghost"
          >
            <div className="text-sm leading-5.5">{currentLabel}</div>
            <GlobeIcon className="size-4" data-icon="inline-end" />
          </Button>
        }
      />
      <DropdownMenuContent className="max-h-90 min-w-50 overflow-auto">
        {localeOptions.map((item) => (
          <DropdownMenuCheckboxItem
            closeOnClick
            checked={current === item.value}
            className="min-h-9 rounded-(--radius-button) pointer-coarse:min-h-11"
            key={item.value}
            onCheckedChange={(checked: boolean) => {
              if (!checked) return;
              i18n.changeLanguage(item.value);
              document.documentElement.lang = item.value;
              setCookieSimple(ORVILO_LOCALE_COOKIE, item.value, 365);
            }}
          >
            <div className="flex flex-col gap-1">
              <div className="text-sm leading-5.5">{item.label}</div>
            </div>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

AuthLangButton.displayName = 'AuthLangButton';

export default AuthLangButton;
