import type { NativePageEditorPublicProps } from './NativePageEditorAssembler';

type Headers = Pick<NativePageEditorPublicProps, 'header' | 'nativeHeader'>;

/** A custom legacy header may consume the old Provider. Its native equivalent
 * must be selected explicitly; null still means no header in either engine. */
export function hasNativePageHeader({ header, nativeHeader }: Headers): boolean {
  return header == null || nativeHeader !== undefined;
}
export function resolveNativePageHeader({ header, nativeHeader }: Headers) {
  if (nativeHeader !== undefined) return nativeHeader;
  if (header == null) return header;
  throw new Error('A custom PageEditor header requires its explicit nativeHeader adapter');
}
