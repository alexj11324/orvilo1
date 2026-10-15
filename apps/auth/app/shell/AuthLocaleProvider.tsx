import { memo, type PropsWithChildren, useEffect, useState } from 'react';

import { DocumentLocale } from '@/layout/GlobalProvider/DocumentLocale';

import { readAuthResources } from './authResources';
import { createAuthI18n } from './createAuthI18n';

interface AuthLocaleProviderProps extends PropsWithChildren {
  locale: string;
}

const AuthLocaleProvider = memo<AuthLocaleProviderProps>(({ children, locale }) => {
  const [i18n] = useState(() => createAuthI18n({ locale, resources: readAuthResources(locale) }));
  const [lang, setLang] = useState(locale);

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

  return <DocumentLocale language={lang}>{children}</DocumentLocale>;
});

AuthLocaleProvider.displayName = 'AuthLocaleProvider';

export default AuthLocaleProvider;
