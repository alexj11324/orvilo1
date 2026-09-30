'use client';

import { InfoIcon, TriangleAlertIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuthorInfo } from '@/business/client/hooks/useAuthorInfo';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useDocumentStore } from '@/store/document';
import { editorSelectors } from '@/store/document/slices/editor';

import { usePageEditorStore } from './store';
import { usePageLockedByOther } from './usePageLockedByOther';
import { usePageLockedBySelf } from './usePageLockedBySelf';

/**
 * Prominent in-body notice shown when another workspace member holds the edit
 * lock: tells the user why the page is read-only and that their edits won't be
 * saved. The Header keeps a compact badge ({@link EditingIndicator}); this is
 * the explanatory surface so a blocked edit never looks unexplained.
 */
const LockedAlert = memo(() => {
  const { t } = useTranslation('file');
  const documentId = usePageEditorStore((s) => s.documentId);
  const isWorkspacePage = usePageEditorStore((s) => s.isWorkspacePage);
  const lockHolderId = usePageEditorStore((s) => s.lockHolderId);
  const isLockedByOther = usePageLockedByOther();
  const isLockedBySelf = usePageLockedBySelf();
  // Our own save was just rejected by the lock — treat as locked even if the
  // lock-service state hasn't caught up yet.
  const saveBlockedByLock = useDocumentStore((s) =>
    documentId ? editorSelectors.saveBlockedByLock(documentId)(s) : false,
  );
  const holder = useAuthorInfo(lockHolderId ?? undefined);

  if (!isWorkspacePage) return null;
  if (!isLockedByOther && !isLockedBySelf && !saveBlockedByLock) return null;

  // Same user, different session (other tab / unreleased prior mount): show a
  // self-aware message and a neutral info tone — it isn't a collaborator
  // conflict, just the user's own stale lease lingering until expiry.
  if (isLockedBySelf) {
    return (
      <Alert style={{ marginBlock: 8 }} variant="info">
        <InfoIcon />
        <AlertTitle>{t('pageEditor.editMode.lockedBySelf')}</AlertTitle>
        <AlertDescription>{t('pageEditor.editMode.lockedBySelfDescription')}</AlertDescription>
      </Alert>
    );
  }

  const title = holder?.fullName
    ? t('pageEditor.editMode.lockedByOther', { name: holder.fullName })
    : t('pageEditor.editMode.lockedBySomeone');

  return (
    <Alert style={{ marginBlock: 8 }} variant="warning">
      <TriangleAlertIcon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{t('pageEditor.editMode.lockedDescription')}</AlertDescription>
    </Alert>
  );
});

LockedAlert.displayName = 'LockedAlert';

export default LockedAlert;
