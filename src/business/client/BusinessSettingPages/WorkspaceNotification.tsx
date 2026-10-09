'use client';

import { useTranslation } from 'react-i18next';

import AsyncBoundary from '@/components/AsyncBoundary';
import AutoSaveHint from '@/components/Editor/AutoSaveHint';
import { FormGroup } from '@/components/GroupForm';
import { WorkspaceNotificationSkeleton } from '@/components/Skeleton/Settings/Notification';
import NotificationPreferences from '@/features/Settings/notification/NotificationPreferences';
import { useSaveState } from '@/hooks/useSaveState';
import { useUserStore } from '@/store/user';

/** The current member's notification preferences inside this workspace. */
export const WorkspaceNotification = () => {
  const { t } = useTranslation('setting');
  const { status, save, retry, lastSavedAt } = useSaveState();
  const useFetchWorkspaceUserPreference = useUserStore((s) => s.useFetchWorkspaceUserPreference);
  const preferenceQuery = useFetchWorkspaceUserPreference();
  const updateWorkspaceUserPreference = useUserStore((s) => s.updateWorkspaceUserPreference);

  return (
    <AsyncBoundary
      data={preferenceQuery.data}
      error={preferenceQuery.error}
      isLoading={preferenceQuery.data === undefined && !preferenceQuery.error}
      loading={<WorkspaceNotificationSkeleton />}
      onRetry={() => void preferenceQuery.mutate()}
    >
      <div className="mx-auto flex w-full min-w-0 max-w-160 flex-col gap-6">
        <h1 className="m-0 text-xl font-semibold">{t('workspaceSetting.notification.title')}</h1>
        <FormGroup
          collapsible={false}
          title={t('notification.matrix.title')}
          extra={
            status !== 'idle' && (
              <AutoSaveHint
                lastUpdatedTime={lastSavedAt}
                saveStatus={status}
                onRetry={() => void retry()}
              />
            )
          }
        >
          <NotificationPreferences
            value={preferenceQuery.data?.notification ?? {}}
            onChange={(partial) =>
              save(() => updateWorkspaceUserPreference({ notification: partial }))
            }
          />
        </FormGroup>
      </div>
    </AsyncBoundary>
  );
};

export default WorkspaceNotification;
