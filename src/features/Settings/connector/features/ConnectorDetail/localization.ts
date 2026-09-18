import { type TFunction } from 'i18next';

type Translate = TFunction<'setting'>;

/**
 * Builtin tools carry a localized title in the `setting` namespace; every other
 * connector kind uses its raw identifier as the panel heading.
 */
export const getNoPermissionsTitle = (identifier: string, type: string, t: Translate) => {
  if (type !== 'builtin') return identifier;

  return t(`tools.builtins.${identifier}.title`, { defaultValue: identifier });
};
