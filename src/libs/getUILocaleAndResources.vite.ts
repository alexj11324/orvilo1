/**
 * Business UI strings (`locales/<lang>/ui.json`) for the lobehub components that
 * vendor packages render. LobeThemeScope merges lobehub's built-in strings under them.
 */
import type { UILocaleResourceInput, UILocaleResources } from './getUILocaleAndResources.utils';
import { normalizeUILocaleResources, resolveUILocale } from './getUILocaleAndResources.utils';

type UILocaleModule = { default: UILocaleResourceInput };
type UILocaleLoaderMap = Record<string, () => Promise<UILocaleModule>>;

const uiLocaleLoaders = import.meta.glob('/locales/*/ui.json') as UILocaleLoaderMap;

const loadBusinessResources = async (locale: string): Promise<UILocaleResources | null> => {
  const key = `/locales/${locale}/ui.json`;
  const loader = uiLocaleLoaders[key];
  if (!loader) return null;
  try {
    const mod = await loader();
    const resources = mod.default;

    return resources ? normalizeUILocaleResources(resources) : null;
  } catch {
    return null;
  }
};

export const getUILocaleAndResources = async (
  locale: string | 'auto',
): Promise<{ locale: string; resources: UILocaleResources }> => {
  const { normalizedLocale, uiLocale } = resolveUILocale(locale);

  const resources =
    (await loadBusinessResources(normalizedLocale)) ?? (await loadBusinessResources('en-US'));

  if (!resources) throw new Error(`Failed to load UI resources for locale=${normalizedLocale}`);

  return {
    locale: uiLocale,
    resources,
  };
};
