import { builtinSavedViewKey } from '@orvilo/types';
import type { TFunction } from 'i18next';

export const savedViewTitle = (id: string, name: string, t: TFunction<'common'>): string => {
  const key = builtinSavedViewKey(id);
  return key ? t(`savedViews.builtinName.${key}`) : name;
};
