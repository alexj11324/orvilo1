'use client';

import { Button, Text } from '@lobehub/ui/base-ui';
import { GlobeIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

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
            icon={GlobeIcon}
            iconPosition="end"
            size="small"
            type="text"
            style={{
              height: 32,
              paddingInline: 8,
            }}
          >
            <Text fontSize={12}>{currentLabel}</Text>
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
              <Text style={{ lineHeight: 1.2 }}>{item.label}</Text>
            </div>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

AuthLangButton.displayName = 'AuthLangButton';

export default AuthLangButton;
