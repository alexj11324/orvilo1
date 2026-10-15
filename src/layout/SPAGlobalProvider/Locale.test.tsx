/**
 * @vitest-environment happy-dom
 */
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import dayjs from 'dayjs';
import { type PropsWithChildren, useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { loadDayjsLocaleModule, initialize, instance } = vi.hoisted(() => ({
  loadDayjsLocaleModule: vi.fn(),
  initialize: vi.fn(),
  instance: { isInitialized: true, language: 'zh-CN', off: vi.fn(), on: vi.fn() },
}));

vi.mock('@/utils/dayjsLocale', () => ({
  loadDayjsLocaleModule,
  normalizeDayjsLocale: (lang: string) => lang,
}));
vi.mock('@/locales/create', () => ({
  createI18nNext: () => ({
    init: initialize,
    instance,
  }),
}));
vi.mock('../../../apps/share/src/shell/createShareI18n', () => ({
  createShareI18n: () => ({ init: initialize, instance }),
}));
vi.mock('../../../apps/workbench/src/shell/createWorkbenchI18n', () => ({
  createWorkbenchI18n: () => ({ init: initialize, instance }),
}));
vi.mock('@/layout/GlobalProvider/Editor', () => ({
  default: ({ children }: PropsWithChildren) => children,
}));

const Locale = (await import('./Locale')).default;
const ShareLocale = (await import('../../../apps/share/src/shell/ShareLocale')).default;
const WorkbenchLocale = (await import('../../../apps/workbench/src/shell/WorkbenchLocale')).default;

let mounts = 0;

const MountCounter = () => {
  useEffect(() => {
    mounts += 1;
  }, []);
  return <div>child</div>;
};

describe('Locale', () => {
  beforeEach(() => {
    mounts = 0;
    document.documentElement.dir = 'ltr';
    loadDayjsLocaleModule.mockReset().mockResolvedValue({ default: { name: 'en' } });
    initialize.mockReset().mockResolvedValue(undefined);
    instance.isInitialized = true;
    instance.language = 'en-US';
    instance.on.mockReset();
    instance.off.mockReset();
    dayjs.locale('en');
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('mounts the subtree once while the language settles', async () => {
    render(
      <Locale defaultLang="zh-CN">
        <MountCounter />
      </Locale>,
    );
    await waitFor(() => expect(loadDayjsLocaleModule).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));

    expect(mounts).toBe(1);
  });

  // Resource loading and i18n events are controlled boundaries; all three
  // actual Locale component bodies run here.
  const LocaleState = () => <output data-testid="actual-locale-state" />;
  const deferred = <T,>() => {
    let resolve: (value: T) => void = () => {};
    const promise = new Promise<T>((done) => {
      resolve = done;
    });
    return { promise, resolve };
  };
  const listener = () => {
    const entry = instance.on.mock.calls.find(([event]) => event === 'languageChanged');
    expect(entry).toBeDefined();
    return entry![1] as (language: string) => Promise<void>;
  };
  const observe = () => {
    screen.getByTestId('actual-locale-state');
    return { direction: document.documentElement.dir };
  };

  describe.each([
    ['SPA', Locale],
    ['Share', ShareLocale],
    ['Workbench', WorkbenchLocale],
  ] as const)('%s asynchronous locale ownership', (_name, Owner) => {
    it('sets the document direction from the latest language', async () => {
      render(
        <Owner defaultLang="en-US">
          <LocaleState />
        </Owner>,
      );
      await waitFor(() => expect(observe().direction).toBe('ltr'));
      const change = listener();
      await act(async () => {
        instance.language = 'fr';
        await change('fr');
      });
      expect(observe()).toEqual({ direction: 'ltr' });
      await act(async () => {
        instance.language = 'ar';
        await change('ar');
      });
      expect(observe()).toEqual({ direction: 'rtl' });
    });

    it('does not let an older dayjs module overwrite the latest global locale', async () => {
      render(
        <Owner defaultLang="en-US">
          <LocaleState />
        </Owner>,
      );
      await waitFor(() => expect(observe().direction).toBe('ltr'));
      const old = deferred<{ default: { name: string } }>();
      const current = deferred<{ default: { name: string } }>();
      loadDayjsLocaleModule.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
      const change = listener();
      let oldRequest!: Promise<void>, currentRequest!: Promise<void>;
      await act(async () => {
        instance.language = 'fr';
        oldRequest = change('fr');
      });
      await act(async () => {
        instance.language = 'ar';
        currentRequest = change('ar');
      });
      await act(async () => {
        current.resolve({ default: { name: 'ar' } });
        await currentRequest;
      });
      expect(dayjs.locale()).toBe('ar');
      await act(async () => {
        old.resolve({ default: { name: 'fr' } });
        await oldRequest;
      });
      expect(dayjs.locale()).toBe('ar');
      expect(observe()).toEqual({ direction: 'rtl' });
    });

    it('does not mutate the global dayjs locale after unmount', async () => {
      const view = render(
        <Owner defaultLang="en-US">
          <LocaleState />
        </Owner>,
      );
      await waitFor(() => expect(observe().direction).toBe('ltr'));
      const dates = deferred<{ default: { name: string } }>();
      loadDayjsLocaleModule.mockReturnValue(dates.promise);
      const change = listener();
      let pending!: Promise<void>;
      await act(async () => {
        instance.language = 'fr';
        pending = change('fr');
      });
      view.unmount();
      expect(instance.off).toHaveBeenCalledWith('languageChanged', change);
      await act(async () => {
        dates.resolve({ default: { name: 'fr' } });
        await pending;
      });
      expect(dayjs.locale()).toBe('en');
    });
  });

  it('prevents a pending initial dayjs load from superseding a later SPA language', async () => {
    const initial = deferred<{ default: { name: string } }>();
    loadDayjsLocaleModule
      .mockReturnValueOnce(initial.promise)
      .mockResolvedValue({ default: { name: 'ar' } });
    render(
      <Locale defaultLang="en-US">
        <LocaleState />
      </Locale>,
    );
    await waitFor(() => expect(observe().direction).toBe('ltr'));
    await act(async () => {
      instance.language = 'ar';
      await listener()('ar');
    });
    expect(dayjs.locale()).toBe('ar');
    await act(async () => {
      initial.resolve({ default: { name: 'en' } });
      await initial.promise;
    });
    expect(dayjs.locale()).toBe('ar');
    expect(observe()).toEqual({ direction: 'rtl' });
  });

  it('does not apply a late SPA initialization callback after unmount', async () => {
    const init = deferred<void>();
    initialize.mockReturnValue(init.promise);
    instance.isInitialized = false;
    const view = render(
      <Locale defaultLang="en-US">
        <LocaleState />
      </Locale>,
    );
    await waitFor(() => expect(observe().direction).toBe('ltr'));
    const apply = vi.spyOn(dayjs, 'locale');
    view.unmount();
    await act(async () => {
      init.resolve();
      await init.promise;
    });
    expect(apply.mock.calls.filter(([locale]) => locale !== undefined)).toHaveLength(0);
  });

  it('does not let an older SPA fallback overwrite a newer successful language', async () => {
    render(
      <Locale defaultLang="en-US">
        <LocaleState />
      </Locale>,
    );
    await waitFor(() => expect(observe().direction).toBe('ltr'));
    const fallback = deferred<{ default: { name: string } }>();
    const error = new Error('controlled-old-locale-module-failure');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    loadDayjsLocaleModule
      .mockClear()
      .mockRejectedValueOnce(error)
      .mockReturnValueOnce(fallback.promise)
      .mockResolvedValue({ default: { name: 'ar' } });
    const change = listener();
    let oldRequest!: Promise<void>;
    await act(async () => {
      instance.language = 'fr';
      oldRequest = change('fr');
    });
    expect(log).toHaveBeenCalledWith('error', error);
    expect(loadDayjsLocaleModule).toHaveBeenCalledTimes(2);
    await act(async () => {
      instance.language = 'ar';
      await change('ar');
    });
    expect(dayjs.locale()).toBe('ar');
    await act(async () => {
      fallback.resolve({ default: { name: 'en' } });
      await oldRequest;
    });
    expect(dayjs.locale()).toBe('ar');
    expect(observe()).toEqual({ direction: 'rtl' });
  });
});
