import {
  ar,
  bg,
  de,
  enUS,
  es,
  faIR,
  fr,
  it,
  ja,
  ko,
  nl,
  pl,
  ptBR,
  ru,
  tr,
  vi,
  zhCN,
  zhTW,
} from 'react-day-picker/locale';
import { useTranslation } from 'react-i18next';

import { normalizeDayjsLocale } from '@/utils/dayjsLocale';

// Keyed by the same normalised codes the dayjs loader in
// `SPAGlobalProvider/Locale.tsx` uses, so the calendar follows the app language.
const CALENDAR_LOCALES = {
  'ar': ar,
  'bg': bg,
  'de': de,
  'en': enUS,
  'es': es,
  'fa': faIR,
  'fr': fr,
  'it': it,
  'ja': ja,
  'ko': ko,
  'nl': nl,
  'pl': pl,
  'pt-br': ptBR,
  'ru': ru,
  'tr': tr,
  'vi': vi,
  'zh-cn': zhCN,
  'zh-tw': zhTW,
} as const;

/** react-day-picker locale for the current app language (English fallback). */
export const getCalendarLocale = (lang: string | undefined) => {
  const code = normalizeDayjsLocale(lang ?? 'en');
  const base = code.split('-')[0] as keyof typeof CALENDAR_LOCALES;
  return (
    CALENDAR_LOCALES[code as keyof typeof CALENDAR_LOCALES] ??
    CALENDAR_LOCALES[base] ??
    CALENDAR_LOCALES.en
  );
};

export const useCalendarLocale = () => {
  const { i18n } = useTranslation();
  return getCalendarLocale(i18n.language);
};
