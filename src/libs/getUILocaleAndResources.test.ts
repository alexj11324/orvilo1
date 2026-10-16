import { describe, expect, it } from 'vitest';

import { getUILocaleAndResources } from './getUILocaleAndResources';

const translateFromUILocaleResources = (
  resources: Record<string, Record<string, string>>,
  key: string,
) => Object.assign({}, ...Object.values(resources))[key];

describe('getUILocaleAndResources', () => {
  it('should return zh-CN locale and zhCn resources for zh-CN', async () => {
    const result = await getUILocaleAndResources('zh-CN');
    expect(result.locale).toBe('zh-CN');
    expect(result.resources).toBeDefined();
  });

  it('should normalize business ui.json into a @lobehub/ui consumable resource map', async () => {
    const result = await getUILocaleAndResources('zh-CN');

    expect(translateFromUILocaleResources(result.resources, 'form.submit')).toBe('提交');
  });

  it('should return only business resources; lobehub built-ins are merged by LobeThemeScope', async () => {
    const result = await getUILocaleAndResources('de-DE');

    expect(result.locale).toBe('de-DE');
    expect(translateFromUILocaleResources(result.resources, 'form.submit')).toBe('Absenden');
    expect(translateFromUILocaleResources(result.resources, 'image.copy')).toBeUndefined();
  });

  it('should return zh-CN locale and zhCn resources for zh-TW', async () => {
    const result = await getUILocaleAndResources('zh-TW');
    expect(result.locale).toBe('zh-CN');
    expect(result.resources).toBeDefined();
  });

  it('should return en-US locale and en resources for en-US', async () => {
    const result = await getUILocaleAndResources('en-US');
    expect(result.locale).toBe('en-US');
    expect(result.resources).toBeDefined();
  });

  it('should return en-US locale and en resources for en', async () => {
    const result = await getUILocaleAndResources('en');
    expect(result.locale).toBe('en-US');
    expect(result.resources).toBeDefined();
  });

  it('should resolve auto from the current document language', async () => {
    const previousLang = document.documentElement.lang;
    document.documentElement.lang = 'zh-CN';

    try {
      const result = await getUILocaleAndResources('auto');

      expect(result.locale).toBe('zh-CN');
      expect(translateFromUILocaleResources(result.resources, 'form.submit')).toBe('提交');
    } finally {
      document.documentElement.lang = previousLang;
    }
  });

  it('should return ar locale and custom resources for ar', async () => {
    const result = await getUILocaleAndResources('ar');
    expect(result.locale).toBe('ar');
    expect(result.resources).toBeDefined();
  });

  it('should return de-DE locale and custom resources for de-DE', async () => {
    const result = await getUILocaleAndResources('de-DE');
    expect(result.locale).toBe('de-DE');
    expect(result.resources).toBeDefined();
  });

  it('should return es-ES locale and custom resources for es-ES', async () => {
    const result = await getUILocaleAndResources('es-ES');
    expect(result.locale).toBe('es-ES');
    expect(result.resources).toBeDefined();
  });

  it('should fallback to en-US business resources for an unknown locale', async () => {
    const result = await getUILocaleAndResources('unknown-locale');
    expect(result.locale).toBe('en-US');
    expect(translateFromUILocaleResources(result.resources, 'form.submit')).toBe('Submit');
  });
});
