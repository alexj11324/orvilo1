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
            size="sm"
            variant="ghost"
            style={{
              height: 32,
              paddingInline: 8,
            }}
          >
            <div className="text-[12px]">{currentLabel}</div>
            <GlobeIcon data-icon="inline-end" />
          </Button>
        }
      />
      <DropdownMenuContent style={{ maxHeight: 360, minWidth: 200, overflow: 'auto' }}>
        {localeOptions.map((item) => (
          <DropdownMenuCheckboxItem
            closeOnClick
            checked={current === item.value}
            key={item.value}
            onCheckedChange={(checked: boolean) => {
              if (!checked) return;
              i18n.changeLanguage(item.value);
              document.documentElement.lang = item.value;
              setCookieSimple(ORVILO_LOCALE_COOKIE, item.value, 365);
            }}
          >
            <div className="flex flex-col gap-1">
              <div style={{ lineHeight: 1.2 }}>{item.label}</div>
            </div>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

AuthLangButton.displayName = 'AuthLangButton';

export default AuthLangButton;
