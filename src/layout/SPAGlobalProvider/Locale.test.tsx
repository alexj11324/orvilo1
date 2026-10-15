import { useDirection } from '@base-ui/react/direction-provider';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import dayjs from 'dayjs';
import { type ReactNode, useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ShareLocale from '../../../apps/share/src/shell/ShareLocale';
import WorkbenchLocale from '../../../apps/workbench/src/shell/WorkbenchLocale';
import Locale from './Locale';

const { load, instance } = vi.hoisted(() => ({
  load: vi.fn(),
  instance: {
    isInitialized: true,
    language: 'en-US',
    on: vi.fn<(event: string, handler: (language: string) => Promise<void>) => void>(),
    off: vi.fn(),
  },
}));
vi.mock('@/utils/dayjsLocale', () => ({
  loadDayjsLocaleModule: load,
  normalizeDayjsLocale: (lang: string) => lang,
}));
vi.mock('@/locales/create', () => ({ createI18nNext: () => ({ instance, init: async () => {} }) }));
vi.mock('../../../apps/share/src/shell/createShareI18n', () => ({
  createShareI18n: () => ({ instance, init: async () => {} }),
}));
vi.mock('../../../apps/workbench/src/shell/createWorkbenchI18n', () => ({
  createWorkbenchI18n: () => ({ instance, init: async () => {} }),
}));
vi.mock('@/layout/GlobalProvider/Editor', () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));

beforeEach(() => {
  vi.clearAllMocks();
  instance.language = 'en-US';
  load.mockResolvedValue({ default: { name: 'en' } });
  dayjs.locale('en');
});
afterEach(cleanup);

describe.each([
  ['SPA', Locale],
  ['share', ShareLocale],
  ['workbench', WorkbenchLocale],
] as const)('%s native locale owner', (_name, Owner) => {
  it('keeps descendants mounted and supplies RTL to native primitives', async () => {
    let mounts = 0;
    function Child() {
      const direction = useDirection();
      useEffect(() => {
        mounts += 1;
      }, []);
      return <span>{direction}</span>;
    }
    render(
      <Owner defaultLang="en-US">
        <Child />
      </Owner>,
    );
    await waitFor(() => expect(instance.on).toHaveBeenCalled());
    const change = instance.on.mock.calls.find(([event]) => event === 'languageChanged')?.[1];
    if (!change) throw new Error('Locale listener was not attached');
    load.mockResolvedValue({ default: { name: 'ar' } });
    await act(async () => {
      instance.language = 'ar';
      await change('ar');
    });
    expect(screen.getByText('rtl')).toBeTruthy();
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
    expect(dayjs.locale()).toBe('ar');
    expect(mounts).toBe(1);
  });
  it('restores document attributes when the established locale owner unmounts', async () => {
    document.documentElement.lang = 'de';
    document.documentElement.dir = 'ltr';
    instance.language = 'ar';
    const owner = render(
      <Owner defaultLang="ar">
        <span>Content</span>
      </Owner>,
    );
    await waitFor(() => expect(document.documentElement.dir).toBe('rtl'));
    owner.unmount();
    expect(document.documentElement.lang).toBe('de');
    expect(document.documentElement.dir).toBe('ltr');
  });
  it('ignores an older date locale which resolves after a newer language', async () => {
    render(
      <Owner defaultLang="en-US">
        <span>Content</span>
      </Owner>,
    );
    await waitFor(() => expect(instance.on).toHaveBeenCalled());
    const change = instance.on.mock.calls.find(([event]) => event === 'languageChanged')?.[1];
    if (!change) throw new Error('Locale listener was not attached');
    let resolveOlder!: (value: { default: { name: string } }) => void;
    load
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveOlder = resolve;
        }),
      )
      .mockResolvedValue({ default: { name: 'ar' } });
    let older!: Promise<void>;
    await act(async () => {
      older = change('fr');
    });
    await act(async () => {
      await change('ar');
    });
    await act(async () => {
      resolveOlder({ default: { name: 'fr' } });
      await older;
    });
    expect(document.documentElement.dir).toBe('rtl');
    expect(dayjs.locale()).toBe('ar');
  });
});
