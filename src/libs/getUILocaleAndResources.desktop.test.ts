import { describe, expect, it, vi } from 'vitest';

const moduleEvaluation = vi.hoisted(() => ({
  businessResources: vi.fn(),
}));

vi.mock('/locales/zh-CN/ui.json', () => {
  moduleEvaluation.businessResources();

  return { default: { business: 'localized' } };
});

describe('getUILocaleAndResources.desktop', () => {
  it('evaluates UI locale resources only when the locale is requested', async () => {
    const { getUILocaleAndResources } = await import('./getUILocaleAndResources.desktop');

    expect(moduleEvaluation.businessResources).not.toHaveBeenCalled();

    const result = await getUILocaleAndResources('zh-CN');

    expect(result).toEqual({
      locale: 'zh-CN',
      resources: { app: { business: 'localized' } },
    });
    expect(moduleEvaluation.businessResources).toHaveBeenCalledOnce();
  });
});
