import { builtinSavedViewKey } from '@orvilo/types';

export const savedViewTitle = (id: string, name: string, t: (key: string) => string): string => {
  const key = builtinSavedViewKey(id);
  return key ? t(`savedViews.builtinName.${key}`) : name;
};
