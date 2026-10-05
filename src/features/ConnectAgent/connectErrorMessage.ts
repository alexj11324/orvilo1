import type { TFunction } from 'i18next';
import { t as i18nT } from 'i18next';

import { normalizeAsyncError } from '@/libs/swr/normalizeError';

/**
 * Maps a thrown value to a localized description for the connect wizard alerts.
 * Known HTTP statuses reuse the shared `error:response.*` copy; everything else
 * falls back to a generic localized line followed by the raw diagnostic message
 * (which is helpful detail, not the headline).
 */
export const connectErrorMessage = (error: unknown, t: TFunction<'chat'>): string => {
  const { status } = normalizeAsyncError(error);
  if (typeof status === 'number' && status >= 400 && status < 600) {
    const translated = i18nT(`response.${status}`, { defaultValue: '', ns: 'error' });
    if (translated) return translated;
  }

  const generic = t('connectAgent.create.errorGeneric');
  const raw =
    error instanceof Error ? error.message : typeof error === 'string' ? error : undefined;
  return raw ? `${generic} ${raw}` : generic;
};
