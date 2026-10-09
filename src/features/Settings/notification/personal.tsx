'use client';

import { useTranslation } from 'react-i18next';

import AutoSaveHint from '@/components/Editor/AutoSaveHint';
import { FormGroup } from '@/components/GroupForm';
import { SettingsSearchAnchor } from '@/features/SettingsSearch/anchor';
import { useSaveState } from '@/hooks/useSaveState';
import { useUserStore } from '@/store/user';

import NotificationPreferences from './NotificationPreferences';

/**
 * Personal event notifications, saved with the user's own settings. Rendered
 * alone on web and under the sound settings on desktop.
 */
const PersonalNotificationSettings = () => {
  const { t } = useTranslation('setting');
  const { status, save, retry, lastSavedAt } = useSaveState();
  const notification = useUserStore((s) => s.settings.notification);
  const setSettings = useUserStore((s) => s.setSettings);

  return (
    <FormGroup
      collapsible={false}
      variant={'filled'}
      extra={
        status !== 'idle' && (
          <AutoSaveHint
            lastUpdatedTime={lastSavedAt}
            saveStatus={status}
            onRetry={() => void retry()}
          />
        )
      }
      title={
        <SettingsSearchAnchor id={'notification-events'}>
          {t('notification.matrix.title')}
        </SettingsSearchAnchor>
      }
    >
      <NotificationPreferences
        value={notification ?? {}}
        onChange={(partial) => save(() => setSettings({ notification: partial }))}
      />
    </FormGroup>
  );
};

export default PersonalNotificationSettings;
