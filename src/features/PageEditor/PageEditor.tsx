'use client';

import { lazy, Suspense, use } from 'react';

import { RouteLoading } from '@/components/Skeleton/RouteSegment';
import { NativeChatRuntimeContext } from '@/features/ChatInput/native/NativeChatRuntimeContext';

import type { PageEditorProps } from './LegacyPageEditor';
import { hasNativePageHeader } from './native/nativePageHeader';

export type { PageEditorProps } from './LegacyPageEditor';

const LegacyPageEditor = lazy(() =>
  import('./LegacyPageEditor').then((module) => ({ default: module.LegacyPageEditor })),
);
const NativePageEditor = lazy(() =>
  import('./native/NativePageEditorEntry').then((module) => ({
    default: module.NativePageEditorEntry,
  })),
);

/** An actual supplied professional math owner enables the full native page.
 * Missing custom adapters keep their existing owner until explicitly migrated;
 * the three production callers already supply every required custom adapter. */
export function PageEditor(props: PageEditorProps) {
  const mathRenderer = use(NativeChatRuntimeContext);
  return (
    <Suspense fallback={<RouteLoading />}>
      {mathRenderer && hasNativePageHeader(props) ? (
        <NativePageEditor {...props} mathRenderer={mathRenderer} />
      ) : (
        <LegacyPageEditor {...props} />
      )}
    </Suspense>
  );
}
