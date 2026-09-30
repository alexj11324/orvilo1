'use client';

import { cssVar } from 'antd-style';
import { Loader2Icon, PencilIcon } from 'lucide-react';
import { type CSSProperties, memo } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuthorInfo } from '@/business/client/hooks/useAuthorInfo';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useDocumentStore } from '@/store/document';
import { editorSelectors } from '@/store/document/slices/editor';

import { usePageEditorStore } from './store';
import { usePageLockedByOther } from './usePageLockedByOther';
import { usePageLockedBySelf } from './usePageLockedBySelf';

const labelStyle: CSSProperties = { color: 'inherit', fontSize: 12, maxWidth: 160 };

/**
 * Compact edit-lock status for the page Header (top-right): a "checking…" hint
 * while the lock resolves, then "someone else is editing" once another member
 * holds it. Stays anchored in the header so the status is always visible as the
 * user scrolls the body. The body Alert ({@link LockedAlert}) carries the
 * prominent explanation; this is the persistent at-a-glance badge.
 *
 * Renders nothing once the page is confirmed free — a personal page then looks
 * exactly the same (no edit-mode controls).
 */
const EditingIndicator = memo(() => {
  const { t } = useTranslation('file');
  const documentId = usePageEditorStore((s) => s.documentId);
  const isWorkspacePage = usePageEditorStore((s) => s.isWorkspacePage);
  const isLockedByOther = usePageLockedByOther();
  const isLockedBySelf = usePageLockedBySelf();
  const isLockPending = usePageEditorStore((s) => s.isLockPending);
  const lockHolderId = usePageEditorStore((s) => s.lockHolderId);
  // Our own save was just rejected by the lock — treat as locked even if the
  // lock-service state hasn't caught up yet.
  const saveBlockedByLock = useDocumentStore((s) =>
    documentId ? editorSelectors.saveBlockedByLock(documentId)(s) : false,
  );
  const holder = useAuthorInfo(lockHolderId ?? undefined);

  if (!isWorkspacePage) return null;

  const locked = isLockedByOther || isLockedBySelf || saveBlockedByLock;

  if (!locked) {
    if (!isLockPending) return null;

    return (
      <div className="flex items-center gap-1" style={{ color: cssVar.colorTextTertiary }}>
        <Loader2Icon className="animate-spin" size={14} />
        <div className="truncate min-w-0" style={{ labelStyle }} style={labelStyle}>
          {t('pageEditor.editMode.checking')}
        </div>
      </div>
    );
  }

  // Same user, different session — show the self-aware label instead of the
  // collaborator-blocked one (which uses the user's own name and reads wrong).
  const label = isLockedBySelf
    ? t('pageEditor.editMode.lockedBySelf')
    : holder?.fullName
      ? t('pageEditor.editMode.lockedByOther', { name: holder.fullName })
      : t('pageEditor.editMode.lockedBySomeone');

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <span style={{ display: 'inline-flex' }}>
              <div className="flex items-center gap-1" style={{ color: cssVar.colorTextTertiary }}>
                <PencilIcon size={14} />
                <div className="truncate min-w-0" style={{ labelStyle }} style={labelStyle}>
                  {label}
                </div>
              </div>
            </span>
          }
        />
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

export default EditingIndicator;
