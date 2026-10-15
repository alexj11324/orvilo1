'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  type EditLockClient,
  type EditLockHealth,
  type EditLockState,
  useEditLock,
} from '@/features/EditLock/useEditLock';
import { useResourceAccess } from '@/features/ResourcePermission/useResourceAccess';
import { usePermission } from '@/hooks/usePermission';
import { mutate } from '@/libs/swr';
import { documentService } from '@/services/document';
import { documentSWRKeys } from '@/services/document/swrKeys';
import { useDocumentStore } from '@/store/document';
import { editorSelectors } from '@/store/document/slices/editor';

import { usePageDocumentMetadata } from '../usePageDocumentMetadata';
import { useNativePageResourceEvents } from './useNativePageResourceEvents';

const lockClient: EditLockClient = {
  acquire: (id, ownerId) => documentService.acquireDocumentLock(id, ownerId),
  peek: (id, ownerId) => documentService.getDocumentLock(id, ownerId),
  release: (id, ownerId) => documentService.releaseDocumentLock(id, ownerId),
};

/** Mount in a document-keyed native session. Shared useEditLock owns acquire,
 * heartbeat, release, network recovery and viewer fallback polling. */
export function useNativePageCollaboration(documentId: string, metadataDirty = false) {
  const page = usePageDocumentMetadata(documentId);
  const { allowed: canEdit } = usePermission('edit_own_content');
  const collaborative = Boolean(page?.workspaceId && page.visibility !== 'private');
  const { canEditResource } = useResourceAccess('document', collaborative ? documentId : undefined);
  const [ownerId] = useState(() => {
    const nonce =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `page:${documentId}:${nonce}`;
  });
  const isDirty = useDocumentStore(editorSelectors.isDirty(documentId));
  const blocked = useDocumentStore(editorSelectors.saveBlockedByLock(documentId));
  const lock = useEditLock({
    client: lockClient,
    enabled: collaborative,
    isDirty: canEdit && canEditResource && (isDirty || metadataDirty),
    ownerId,
    pollWhileViewing: false,
    resourceId: documentId,
  });
  // SSE pushes trigger an authoritative owner-aware peek, rather than deriving a
  // verdict from actorId (two windows may share the same signed-in account).
  const [observed, setObserved] = useState<EditLockState>();
  const generation = useRef(0);
  const peekSequence = useRef(0);
  useEffect(
    () => () => {
      generation.current += 1;
    },
    [],
  );
  const refreshLock = useCallback(() => {
    if (!collaborative) return;
    const current = generation.current;
    const request = ++peekSequence.current;
    void lockClient
      .peek(documentId, ownerId)
      .then((value) => {
        if (generation.current === current && peekSequence.current === request) setObserved(value);
      })
      .catch(() => {});
  }, [collaborative, documentId, ownerId]);
  useEffect(() => {
    peekSequence.current += 1;
    setObserved(undefined);
  }, [lock.holderId, lock.ownerId, lock.expiresAt, lock.lockedByOther, lock.pending]);
  const verdict = collaborative
    ? (observed ?? lock)
    : { holderId: null, lockedByOther: false, ownerId: null, expiresAt: null };
  const pendingRefresh = useRef(false);
  const requestDocumentRefresh = useCallback(() => {
    if (useDocumentStore.getState().documents[documentId]?.isDirty) {
      pendingRefresh.current = true;
      return;
    }
    pendingRefresh.current = false;
    void mutate(documentSWRKeys.editor(documentId));
  }, [documentId]);
  useEffect(() => {
    if (!isDirty && pendingRefresh.current) requestDocumentRefresh();
  }, [isDirty, requestDocumentRefresh]);
  useNativePageResourceEvents({
    documentId,
    workspaceId: page?.workspaceId,
    onDocumentUpdated: requestDocumentRefresh,
    onLockChanged: refreshLock,
  });

  const previous = useRef({ other: verdict.lockedByOther, health: lock.health });
  useEffect(() => {
    const recovered = previous.current.health === 'lost' && lock.health === 'healthy';
    const changedHolder = previous.current.other !== verdict.lockedByOther;
    previous.current = { other: verdict.lockedByOther, health: lock.health };
    if (collaborative && (recovered || changedHolder || blocked)) requestDocumentRefresh();
  }, [blocked, collaborative, lock.health, requestDocumentRefresh, verdict.lockedByOther]);
  useEffect(() => {
    if (!collaborative || !verdict.expiresAt) return;
    const expiry =
      verdict.expiresAt instanceof Date
        ? verdict.expiresAt.getTime()
        : new Date(verdict.expiresAt).getTime();
    if (!Number.isFinite(expiry)) return;
    const timer = setTimeout(refreshLock, Math.max(1000, expiry - Date.now() + 500));
    return () => clearTimeout(timer);
  }, [collaborative, refreshLock, verdict.expiresAt]);
  useEffect(() => {
    if (
      !collaborative ||
      lock.pending ||
      lock.health !== 'healthy' ||
      verdict.lockedByOther ||
      !blocked
    )
      return;
    useDocumentStore.getState().clearSaveBlockedByLock(documentId);
  }, [blocked, collaborative, documentId, lock.health, lock.pending, verdict.lockedByOther]);

  const health: EditLockHealth = collaborative ? lock.health : 'healthy';
  return {
    editable: Boolean(
      page &&
      canEdit &&
      canEditResource &&
      !lock.pending &&
      !verdict.lockedByOther &&
      (!collaborative || lock.health !== 'lost') &&
      !blocked,
    ),
    lockOwnerId: collaborative ? ownerId : undefined,
    lock: { ...verdict, health, pending: lock.pending },
    collaborative,
  };
}
