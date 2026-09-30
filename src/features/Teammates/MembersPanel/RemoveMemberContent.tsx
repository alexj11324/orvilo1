'use client';

import { createStaticStyles, cx } from 'antd-style';
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

const styles = createStaticStyles(({ css }) => ({
  body: css`
    padding-block: 0 16px;
    padding-inline: 20px;
  `,
  previewRow: css`
    display: flex;
    gap: 8px;
    align-items: baseline;
    font-size: 13px;
  `,
}));

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
    <div className={cx(styles.body, 'flex flex-col gap-4')}>
      <Alert variant="warning">
        <AlertTriangle size={16} />
        <AlertTitle>
          {t('workspaceSetting.members.removeWarning', { name: target.displayName })}
        </AlertTitle>
      </Alert>

      {isLoading && (
        <div className="flex flex-col gap-2.5">
          <Skeleton className="h-3" style={{ marginBottom: 0, width: '70%' }} />
          <Skeleton className="h-3" style={{ marginBottom: 0, width: '55%' }} />
          <Skeleton className="h-3" style={{ marginBottom: 0, width: '60%' }} />
        </div>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>{t('workspaceSetting.members.previewFailed')}</AlertTitle>
        </Alert>
      )}
      {preview && (
        <div className="flex flex-col gap-1">
          <div className="text-[13px] font-medium">
            {t('workspaceSetting.members.previewTitle')}
          </div>
          <div className={styles.previewRow}>
            <div className="text-[13px] text-muted-foreground">
              {t('workspaceSetting.members.previewTasks', { count: preview.assignedTaskCount })}
            </div>
          </div>
          <div className={styles.previewRow}>
            <div className="text-[13px] text-muted-foreground">
              {t('workspaceSetting.members.previewReviews', {
                count: preview.reviewingTaskCount,
              })}
            </div>
          </div>
          <div className={styles.previewRow}>
            <div className="text-[13px] text-muted-foreground">
              {t('workspaceSetting.members.previewDelegations', {
                count: preview.runningDelegationCount,
              })}
            </div>
          </div>
          <div className={styles.previewRow}>
            <div className="text-[13px] text-muted-foreground">
              {t('workspaceSetting.members.previewDevices', {
                count: preview.sharedDeviceCount,
              })}
            </div>
          </div>
        </div>
      )}

      {preview && hasImpact && reassignOptions.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="text-[13px] font-medium">
            {t('workspaceSetting.members.reassignLabel')}
          </div>
          <Select
            allowClear
            options={reassignOptions}
            placeholder={t('workspaceSetting.members.reassignPlaceholder')}
            value={reassignTo}
            onChange={(value) => setReassignTo(value as string | undefined)}
          />
        </div>
      )}

      <ModalFooter>
        <Button onClick={close}>{t('cancel', { ns: 'common' })}</Button>
        {/* Remove stays armed only after the preview actually landed: a
            failed or in-flight preview means the impact numbers were never
            seen so the destructive action must not be clickable. */}
        <Button
          disabled={!removalArmed({ error, isLoading, mutating, preview })}
          loading={mutating}
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
