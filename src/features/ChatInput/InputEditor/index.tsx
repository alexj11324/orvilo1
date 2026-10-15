import { lazy, Suspense, use } from 'react';
import { useTranslation } from 'react-i18next';

import { Spinner } from '@/components/ui/spinner';

import { NativeChatRuntimeContext } from '../native/NativeChatRuntimeContext';
import type { InputEditorProps } from './types';

const LegacyInputEditor = lazy(() => import('./LegacyInputEditor'));
const NativeInputEditor = lazy(() =>
  import('../native/StoreBoundNativeChatInputEditor').then((module) => ({
    default: module.StoreBoundNativeChatInputEditor,
  })),
);

export default function InputEditor(props: InputEditorProps) {
  const renderer = use(NativeChatRuntimeContext);
  const { t } = useTranslation('common');
  return (
    <Suspense
      fallback={
        <div
          aria-busy="true"
          className="flex items-center gap-2 text-sm text-muted-foreground"
          role="status"
          style={{ minHeight: Math.max(1, props.defaultRows ?? 2) * 22 }}
        >
          <Spinner aria-hidden="true" role="presentation" />
          <span>{t('loading')}</span>
        </div>
      }
    >
      {renderer ? (
        <NativeInputEditor {...props} mathRenderer={renderer} />
      ) : (
        <LegacyInputEditor {...props} />
      )}
    </Suspense>
  );
}
