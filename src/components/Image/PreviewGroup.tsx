'use client';

import { createContext, memo, type ReactNode, use, useCallback, useMemo } from 'react';

import { useSingleton } from '@/hooks/useSingleton';

export interface ImagePreviewOptions {
  /** Upper zoom bound, as a multiple of the natural size. */
  maxScale?: number;
  /** Replaces the default fetch-and-save download. */
  onDownload?: (source: string) => void | Promise<void>;
  onOpenChange?: (open: boolean) => void;
  /** Source shown in the viewer when it differs from the thumbnail. */
  src?: string;
}

export interface PreviewEntry {
  getElement: () => HTMLImageElement | null;
  id: string;
  options?: ImagePreviewOptions;
}

interface PreviewGroupContextValue {
  getEntries: () => PreviewEntry[];
  preview?: boolean | ImagePreviewOptions;
  register: (entry: PreviewEntry) => () => void;
}

const PreviewGroupContext = createContext<PreviewGroupContextValue | null>(null);

export const usePreviewGroup = () => use(PreviewGroupContext);

const byDocumentOrder = (a: PreviewEntry, b: PreviewEntry) => {
  const elementA = a.getElement();
  const elementB = b.getElement();
  if (!elementA || !elementB) return 0;
  const position = elementA.compareDocumentPosition(elementB);
  if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
  if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
  return 0;
};

export interface PreviewGroupProps {
  children?: ReactNode;
  /** `false` lets each image open its own viewer. */
  enable?: boolean;
  /** Preview options shared by every image in the group, or `false` to disable preview. */
  preview?: boolean | ImagePreviewOptions;
}

/**
 * Groups the `Image`s rendered inside it into one gallery: opening any of them
 * lets the viewer step through all of them in document order.
 */
const PreviewGroup = memo<PreviewGroupProps>(({ children, enable = true, preview }) => {
  const entries = useSingleton(() => new Map<string, PreviewEntry>());

  const register = useCallback(
    (entry: PreviewEntry) => {
      entries.set(entry.id, entry);
      return () => {
        entries.delete(entry.id);
      };
    },
    [entries],
  );
  const getEntries = useCallback(() => [...entries.values()].sort(byDocumentOrder), [entries]);
  const value = useMemo(() => ({ getEntries, preview, register }), [getEntries, preview, register]);

  if (!enable) return children;
  return <PreviewGroupContext value={value}>{children}</PreviewGroupContext>;
});
PreviewGroup.displayName = 'PreviewGroup';

export default PreviewGroup;
