'use client';

import type { NativePageChrome } from '../NativePageEditorAssembler';
import { NativePageCreate } from './NativePageCreate';
import { NativePageHeader } from './NativePageHeader';
import { NativePageTitle } from './NativePageTitle';

/** Completed primary renderers. History/rightPanel, body tools and social owners
 * must still be supplied; this factory cannot silently omit those capabilities. */
export function createNativePageChrome(
  remaining: Omit<NativePageChrome, 'header' | 'titleAndEmoji' | 'create'>,
): NativePageChrome {
  return {
    ...remaining,
    header: (state) => <NativePageHeader state={state} />,
    titleAndEmoji: (state) => <NativePageTitle state={state} />,
    create: (state) => <NativePageCreate state={state} />,
  };
}
export { NativePageBreadcrumb } from './NativePageBreadcrumb';
export { NativePageCreate } from './NativePageCreate';
export { NativePageHeader } from './NativePageHeader';
export { NativePageTitle } from './NativePageTitle';
