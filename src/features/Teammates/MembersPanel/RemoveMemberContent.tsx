'use client';

import { Flexbox, Icon } from '@lobehub/ui';
import {
  Alert,
  Button,
  ModalFooter,
  Select,
  SkeletonText,
  Text,
  useModalContext,
} from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import { AlertTriangle } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { WorkspaceMemberSummary } from '../api/contract';
import { useRemovalPreview, useTeammateActions } from '../api/hooks';

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
    <Flexbox className={styles.body} gap={16}>
      <Alert
        icon={<Icon icon={AlertTriangle} size={16} />}
        title={t('workspaceSetting.members.removeWarning', { name: target.displayName })}
        type="warning"
      />

      {isLoading && <SkeletonText active paragraph={{ rows: 3 }} />}
      {error && <Alert title={t('workspaceSetting.members.previewFailed')} type="error" />}
      {preview && (
        <Flexbox gap={4}>
          <Text fontSize={13} weight={500}>
            {t('workspaceSetting.members.previewTitle')}
          </Text>
          <div className={styles.previewRow}>
            <Text fontSize={13} type="secondary">
              {t('workspaceSetting.members.previewTasks', { count: preview.assignedTaskCount })}
            </Text>
          </div>
          <div className={styles.previewRow}>
            <Text fontSize={13} type="secondary">
              {t('workspaceSetting.members.previewReviews', {
                count: preview.reviewingTaskCount,
              })}
            </Text>
          </div>
          <div className={styles.previewRow}>
            <Text fontSize={13} type="secondary">
              {t('workspaceSetting.members.previewDelegations', {
                count: preview.runningDelegationCount,
              })}
            </Text>
          </div>
          <div className={styles.previewRow}>
            <Text fontSize={13} type="secondary">
              {t('workspaceSetting.members.previewDevices', {
                count: preview.sharedDeviceCount,
              })}
            </Text>
          </div>
        </Flexbox>
      )}

      {preview && hasImpact && reassignOptions.length > 0 && (
        <Flexbox gap={6}>
          <Text fontSize={13} weight={500}>
            {t('workspaceSetting.members.reassignLabel')}
          </Text>
          <Select
            allowClear
            options={reassignOptions}
            placeholder={t('workspaceSetting.members.reassignPlaceholder')}
            value={reassignTo}
            onChange={(value) => setReassignTo(value as string | undefined)}
          />
        </Flexbox>
      )}

      <ModalFooter>
        <Button onClick={close}>{t('cancel', { ns: 'common' })}</Button>
        <Button
          danger
          disabled={isLoading}
          loading={mutating}
          type="primary"
          onClick={handleRemove}
        >
          {t('workspaceSetting.members.removeAction')}
        </Button>
      </ModalFooter>
    </Flexbox>
  );
});

RemoveMemberContent.displayName = 'RemoveMemberContent';

export default RemoveMemberContent;
