'use client';

import { InfoIcon, TriangleAlertIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import { usePageEditorStore } from './store';
import { usePageLockedByOther } from './usePageLockedByOther';

/**
 * Surfaces the local edit lock health when it deviates from `healthy`:
 *
 * - `unstable`: a heartbeat just failed and we're retrying. Shown as a quiet
 *   info banner so the user knows the editor is briefly reconnecting without
 *   being alarmed by a warning.
 * - `lost`: repeated heartbeats failed or the server confirmed another holder.
 *   Shown as a warning banner. Suppressed when {@link LockedAlert} is already
 *   showing for "someone else is editing" — that surface owns the message in
 *   that case and stacking both would be noise.
 */
const LockStatusBanner = memo(() => {
  const { t } = useTranslation('file');
  const lockHealth = usePageEditorStore((s) => s.lockHealth);
  const isWorkspacePage = usePageEditorStore((s) => s.isWorkspacePage);
  const isLockedByOther = usePageLockedByOther();

  if (!isWorkspacePage) return null;
  if (!lockHealth || lockHealth === 'healthy') return null;
  // Yield to LockedAlert when another member also has the lock — that surface
  // already explains the situation; double-banners are visual noise.
  if (isLockedByOther) return null;

  if (lockHealth === 'unstable') {
    return (
      <Alert style={{ marginBlock: 8 }} variant="info">
        <InfoIcon />
        <AlertTitle>{t('pageEditor.editMode.lockUnstable')}</AlertTitle>
      </Alert>
    );
  }

  return (
    <Alert style={{ marginBlock: 8 }} variant="warning">
      <TriangleAlertIcon />
      <AlertTitle>{t('pageEditor.editMode.lockLostTitle')}</AlertTitle>
      <AlertDescription>{t('pageEditor.editMode.lockLostDescription')}</AlertDescription>
    </Alert>
  );
});

LockStatusBanner.displayName = 'LockStatusBanner';

export default LockStatusBanner;
