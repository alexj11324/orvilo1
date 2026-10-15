'use client';

import { cn } from 'cn';
import { AlertTriangle } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ModalFooter, useModalContext } from '@/components/Modal';
import Select from '@/components/Select';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

import type { WorkspaceMemberSummary } from '../api/contract';
import { useRemovalPreview, useTeammateActions } from '../api/hooks';
import { removalArmed } from './removalArmed';

const styles = {
  body: 'pbs-0 pbe-4 px-5',
  previewRow: 'flex gap-2 items-baseline text-sm leading-5.5',
};

export interface RemoveMemberTarget {
  displayName: string;
  member: WorkspaceMemberSummary;
}

interface RemoveMemberContentProps {
  candidates: WorkspaceMemberSummary[];
  target: RemoveMemberTarget;
}

/**
 * Removal confirmation with the real `removalPreview`: what the member still
 * holds (assigned tasks, reviews, running delegations, devices) plus an
 * optional reassignee. The preview is fetched only while this dialog is open,
 * so the numbers are never stale when the user commits.
 */
const RemoveMemberContent = memo<RemoveMemberContentProps>(({ candidates, target }) => {
  const { t } = useTranslation('setting');
  const { close } = useModalContext();
  const { remove, mutating } = useTeammateActions();
  const { data: preview, error, isLoading } = useRemovalPreview(target.member.userId, true);
  const [reassignTo, setReassignTo] = useState<string | undefined>(undefined);

  const reassignOptions = useMemo(
    () =>
      candidates
        .filter((member) => member.userId !== target.member.userId && !member.deletedAt)
        .map((member) => ({
          label:
            member.user?.fullName || member.user?.username || member.user?.email || member.userId,
          value: member.userId,
        })),
    [candidates, target.member.userId],
  );

  const handleRemove = useCallback(async () => {
    const ok = await remove(target.member.userId, reassignTo);
    if (ok) close();
  }, [remove, target.member.userId, reassignTo, close]);

  const hasImpact =
    preview &&
    (preview.assignedTaskCount > 0 ||
      preview.reviewingTaskCount > 0 ||
      preview.runningDelegationCount > 0 ||
      preview.sharedDeviceCount > 0);

  return (
    <div className={cn(styles.body, 'flex flex-col gap-4')}>
      <Alert className="rounded-(--radius-card) text-sm leading-5.5" variant="warning">
        <AlertTriangle size={16} />
        <AlertTitle className="line-clamp-none text-sm leading-5.5 tracking-normal">
          {t('workspaceSetting.members.removeWarning', { name: target.displayName })}
        </AlertTitle>
      </Alert>

      {isLoading && (
        <div className="flex flex-col gap-2.5">
          <Skeleton className="mb-0 h-3 w-7/10" />
          <Skeleton className="mb-0 h-3 w-11/20" />
          <Skeleton className="mb-0 h-3 w-3/5" />
        </div>
      )}
      {error && (
        <Alert className="rounded-(--radius-card) text-sm leading-5.5" variant="destructive">
          <AlertTitle className="line-clamp-none text-sm leading-5.5 tracking-normal">
            {t('workspaceSetting.members.previewFailed')}
          </AlertTitle>
        </Alert>
      )}
      {preview && (
        <div className="flex flex-col gap-1">
          <div className="text-sm leading-5.5 font-medium">
            {t('workspaceSetting.members.previewTitle')}
          </div>
          <div className={styles.previewRow}>
            <div className="text-sm leading-5.5 text-muted-foreground">
              {t('workspaceSetting.members.previewTasks', { count: preview.assignedTaskCount })}
            </div>
          </div>
          <div className={styles.previewRow}>
            <div className="text-sm leading-5.5 text-muted-foreground">
              {t('workspaceSetting.members.previewReviews', {
                count: preview.reviewingTaskCount,
              })}
            </div>
          </div>
          <div className={styles.previewRow}>
            <div className="text-sm leading-5.5 text-muted-foreground">
              {t('workspaceSetting.members.previewDelegations', {
                count: preview.runningDelegationCount,
              })}
            </div>
          </div>
          <div className={styles.previewRow}>
            <div className="text-sm leading-5.5 text-muted-foreground">
              {t('workspaceSetting.members.previewDevices', {
                count: preview.sharedDeviceCount,
              })}
            </div>
          </div>
        </div>
      )}

      {preview && hasImpact && reassignOptions.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="text-sm leading-5.5 font-medium">
            {t('workspaceSetting.members.reassignLabel')}
          </div>
          <Select
            allowClear
            aria-label={t('workspaceSetting.members.reassignLabel')}
            options={reassignOptions}
            placeholder={t('workspaceSetting.members.reassignPlaceholder')}
            size="normal"
            value={reassignTo}
            onChange={(value) => setReassignTo(value as string | undefined)}
          />
        </div>
      )}

      <ModalFooter className="p-0">
        <Button size="lg" onClick={close}>
          {t('cancel', { ns: 'common' })}
        </Button>
        {/* Remove stays armed only after the preview actually landed: a
            failed or in-flight preview means the impact numbers were never
            seen so the destructive action must not be clickable. */}
        <Button
          disabled={!removalArmed({ error, isLoading, mutating, preview })}
          loading={mutating}
          size="lg"
          variant="destructive"
          onClick={handleRemove}
        >
          {t('workspaceSetting.members.removeAction')}
        </Button>
      </ModalFooter>
    </div>
  );
});

RemoveMemberContent.displayName = 'RemoveMemberContent';

export default RemoveMemberContent;
