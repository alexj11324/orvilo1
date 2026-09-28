import { type TFunction } from 'i18next';
import { describe, expect, it, vi } from 'vitest';

import { getNoPermissionsTitle } from './localization';

const createTranslator = (translations: Record<string, string> = {}) =>
  vi.fn(
    (key: string, options?: { defaultValue?: string }) =>
      translations[key] ?? options?.defaultValue ?? key,
  ) as unknown as TFunction<'setting'>;

describe('ConnectorDetail localization helpers', () => {
  it('localizes the no-permissions title for builtin tools only', () => {
    const t = createTranslator({ 'tools.builtins.orvilo-calculator.title': '计算器' });

    expect(getNoPermissionsTitle('orvilo-calculator', 'builtin', t)).toBe('计算器');
    expect(getNoPermissionsTitle('custom-http', 'mcp-connector', t)).toBe('custom-http');
    expect(t).toHaveBeenCalledTimes(1);
  });
});
