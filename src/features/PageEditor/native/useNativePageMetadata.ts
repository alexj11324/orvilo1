'use client';

import { EDITOR_DEBOUNCE_TIME, EDITOR_MAX_WAIT } from '@orvilo/const';
import { debounce } from 'es-toolkit/compat';
import { useEffect, useRef, useState } from 'react';

import { documentService } from '@/services/document';
import { useDocumentStore } from '@/store/document';
import { truncateByWeightedLength } from '@/utils/textLength';

import { usePageDocumentMetadataActions } from '../usePageDocumentMetadata';

interface Metadata {
  emoji?: string;
  title: string;
}
export interface NativeMetadataOptions extends Metadata {
  documentId: string;
  editable: boolean;
  metaReadOnly?: boolean;
  onEmojiChange?: (emoji: string | undefined) => void;
  onTitleChange?: (title: string) => void;
}
/** Metadata writes update only metadata, not a captured document body. Failed
 * requests retain the unsaved revision and never notify parents as saved. */
export function useNativePageMetadata(options: NativeMetadataOptions) {
  const [value, setValue] = useState<Metadata>({ title: options.title, emoji: options.emoji });
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<unknown>();
  const valueRef = useRef(value);
  valueRef.current = value;
  const saved = useRef<Metadata>(value);
  const revision = useRef(0);
  const live = useRef(options);
  live.current = options;
  const mounted = useRef(true);
  const inFlight = useRef<Promise<void> | undefined>(undefined);
  const cache = usePageDocumentMetadataActions(options.documentId);
  const cacheRef = useRef(cache);
  cacheRef.current = cache;
  const same = (a: Metadata, b: Metadata) => a.title === b.title && a.emoji === b.emoji;
  const persist = async (): Promise<void> => {
    if (inFlight.current) {
      await inFlight.current;
      if (!same(valueRef.current, saved.current)) return persist();
      return;
    }
    const current = live.current;
    if (!current.editable || current.metaReadOnly || same(valueRef.current, saved.current)) return;
    const pending = { ...valueRef.current };
    const previous = { ...saved.current };
    const pendingRevision = revision.current;
    const active = useDocumentStore.getState();
    if (
      active.activeDocumentId !== current.documentId ||
      active.documents[current.documentId]?.saveBlockedByLock
    )
      throw new Error('Native metadata no longer owns an editable document');
    if (mounted.current) {
      setStatus('saving');
      setError(undefined);
    }
    const request = (async () => {
      try {
        await documentService.updateDocument({
          id: current.documentId,
          title: pending.title,
          // null explicitly clears a removed emoji; omission would retain it.
          metadata: { emoji: pending.emoji ?? null },
          lockOwnerId: active.documents[current.documentId]?.lockOwnerId,
          saveSource: 'autosave',
        });
        saved.current = pending;
        cacheRef.current.updateTitle(pending.title);
        cacheRef.current.updateEmoji(pending.emoji);
        if (pending.title !== previous.title) live.current.onTitleChange?.(pending.title);
        if (pending.emoji !== previous.emoji) live.current.onEmojiChange?.(pending.emoji);
        if (mounted.current) setStatus(pendingRevision === revision.current ? 'saved' : 'idle');
      } catch (nextError) {
        if (mounted.current) {
          setError(nextError);
          setStatus('idle');
        }
        throw nextError;
      }
    })();
    inFlight.current = request;
    try {
      await request;
    } finally {
      inFlight.current = undefined;
    }
  };
  const saveRef = useRef(persist);
  saveRef.current = persist;
  const [debounced] = useState(() =>
    debounce(
      () => {
        void saveRef
          .current()
          .catch((nextError) => console.error('[NativePageMetadata] Autosave failed', nextError));
      },
      EDITOR_DEBOUNCE_TIME,
      { maxWait: EDITOR_MAX_WAIT, trailing: true },
    ),
  );
  useEffect(() => {
    const incoming = { title: options.title, emoji: options.emoji };
    if (!same(valueRef.current, saved.current)) return;
    saved.current = incoming;
    valueRef.current = incoming;
    setValue(incoming);
  }, [options.title, options.emoji]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      debounced.cancel();
      void saveRef
        .current()
        .catch((nextError) => console.error('[NativePageMetadata] Final save failed', nextError));
    };
  }, [debounced]);
  const change = (next: Metadata) => {
    if (!live.current.editable || live.current.metaReadOnly) return;
    revision.current += 1;
    valueRef.current = next;
    setValue(next);
    setStatus('idle');
    debounced();
  };
  return {
    ...value,
    status,
    error,
    dirty: !same(value, saved.current),
    setTitle: (title: string) =>
      change({ ...valueRef.current, title: truncateByWeightedLength(title, 100) }),
    setEmoji: (emoji: string | undefined) => change({ ...valueRef.current, emoji }),
    flush: async () => {
      debounced.cancel();
      await saveRef.current();
      if (!same(valueRef.current, saved.current))
        throw new Error('Native metadata remains unsaved');
    },
  };
}
