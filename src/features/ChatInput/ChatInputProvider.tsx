'use client';

import { lazy, memo, type ReactNode, Suspense, use } from 'react';
import { useTranslation } from 'react-i18next';

import { Spinner } from '@/components/ui/spinner';

import { NativeChatRuntimeContext } from './native/NativeChatRuntimeContext';
import type { StoreUpdaterProps } from './StoreUpdater';

export interface ChatInputProviderProps extends StoreUpdaterProps {
  children: ReactNode;
}
const LegacyProvider = lazy(() => import('./LegacyChatInputProvider'));
const NativeProvider = lazy(() =>
  import('./native/NativeChatInputProvider').then((module) => ({
    default: module.NativeChatInputProvider,
  })),
);

/** The actual provider follows explicit host ownership, before constructing an
 * editor. A native host never allocates an unused SDK editor as a side effect. */
export const ChatInputProvider = memo<ChatInputProviderProps>((props) => {
  const renderer = use(NativeChatRuntimeContext);
  const { t } = useTranslation('common');
  return (
    <Suspense
      fallback={
        <div
          aria-busy="true"
          className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground"
          role="status"
        >
          <Spinner aria-hidden="true" role="presentation" />
          {t('loading')}
        </div>
      }
    >
      {renderer ? (
        <NativeProvider {...props} mathRenderer={renderer} />
      ) : (
        <LegacyProvider {...props} />
      )}
    </Suspense>
  );
});
