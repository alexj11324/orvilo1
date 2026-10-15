'use client';

import dayjs from 'dayjs';
import type { ResourceLanguage } from 'i18next';
import { memo, type PropsWithChildren, useEffect, useRef, useState } from 'react';

import { DocumentLocale } from '@/layout/GlobalProvider/DocumentLocale';
import type { DayjsLocaleGlobEntry } from '@/utils/dayjsLocale';
import { loadDayjsLocaleModule, normalizeDayjsLocale } from '@/utils/dayjsLocale';

import { createWorkbenchI18n } from './createWorkbenchI18n';

const dayjsLocaleLoaders: Record<string, DayjsLocaleGlobEntry> = {
  'ar': () => import('dayjs/locale/ar'),
  'bg': () => import('dayjs/locale/bg'),
  'de': () => import('dayjs/locale/de'),
  'en': () => import('dayjs/locale/en'),
  'es': () => import('dayjs/locale/es'),
  'fa': () => import('dayjs/locale/fa'),
  'fr': () => import('dayjs/locale/fr'),
  'it': () => import('dayjs/locale/it'),
  'ja': () => import('dayjs/locale/ja'),
  'ko': () => import('dayjs/locale/ko'),
  'nl': () => import('dayjs/locale/nl'),
  'pl': () => import('dayjs/locale/pl'),
  'pt-br': () => import('dayjs/locale/pt-br'),
  'ru': () => import('dayjs/locale/ru'),
  'tr': () => import('dayjs/locale/tr'),
  'vi': () => import('dayjs/locale/vi'),
  'zh-cn': () => import('dayjs/locale/zh-cn'),
  'zh-tw': () => import('dayjs/locale/zh-tw'),
};

const updateDayjs = async (lang: string, isCurrent: () => boolean) => {
  const locale = normalizeDayjsLocale(lang);
  const loader = dayjsLocaleLoaders[locale] ?? dayjsLocaleLoaders.en;
  const mod = await loadDayjsLocaleModule(loader!);

  if (isCurrent()) dayjs.locale(mod.default);
};

interface WorkbenchLocaleProps extends PropsWithChildren {
  defaultLang?: string;
  resources?: ResourceLanguage;
}

const WorkbenchLocale = memo<WorkbenchLocaleProps>(({ children, defaultLang, resources }) => {
  const [i18n] = useState(() => createWorkbenchI18n(defaultLang, resources));
  const [lang, setLang] = useState(defaultLang ?? 'en-US');
  const localeRequest = useRef(0);

  if (!i18n.instance.isInitialized) void i18n.init({ initAsync: !resources });

  useEffect(() => {
    let active = true;
    const applyLocale = async (nextLang: string) => {
      const request = ++localeRequest.current;
      const isCurrent = () => active && localeRequest.current === request;
      setLang(nextLang);
      await updateDayjs(nextLang, isCurrent);
    };

    void applyLocale(i18n.instance.language || defaultLang || 'en-US');
    i18n.instance.on('languageChanged', applyLocale);

    return () => {
      active = false;
      i18n.instance.off('languageChanged', applyLocale);
    };
  }, [defaultLang, i18n]);

  return <DocumentLocale language={lang}>{children}</DocumentLocale>;
});

WorkbenchLocale.displayName = 'WorkbenchLocale';

export default WorkbenchLocale;
