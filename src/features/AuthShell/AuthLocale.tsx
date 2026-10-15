'use client';

import { memo, type PropsWithChildren, useEffect, useState } from 'react';

import { useDocumentDirection } from '@/hooks/useDocumentDirection';

import { createAuthI18n } from './createAuthI18n';

interface AuthLocaleProps extends PropsWithChildren {
  defaultLang?: string;
}

const AuthLocale = memo<AuthLocaleProps>(({ children, defaultLang }) => {
  const [i18n] = useState(() => createAuthI18n(defaultLang));
  const [lang, setLang] = useState(defaultLang ?? 'en-US');

  if (!i18n.instance.isInitialized) {
    i18n.init();
  }

  useEffect(() => {
    const handleLang = (lng: string) => {
      setLang((prev) => (prev === lng ? prev : lng));
    };

    i18n.instance.on('languageChanged', handleLang);
    return () => {
      i18n.instance.off('languageChanged', handleLang);
    };
  }, [i18n]);

  useDocumentDirection(lang);

  return children;
});

AuthLocale.displayName = 'AuthLocale';

export default AuthLocale;
