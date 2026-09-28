export type PortalLocale = 'en' | 'zh-Hans';

export type PortalLocaleResolution = {
  htmlLang: string;
  locale: PortalLocale;
};

/** The portal ships en + zh-Hans; every other language falls back to en. */
export const resolvePortalLocale = (
  rawLanguage: string | null | undefined,
): PortalLocaleResolution => {
  const language = rawLanguage?.split(',', 1)[0]?.split(';', 1)[0]?.trim().toLowerCase();

  if (language?.startsWith('zh')) {
    return { htmlLang: 'zh-CN', locale: 'zh-Hans' };
  }
  return { htmlLang: 'en', locale: 'en' };
};
