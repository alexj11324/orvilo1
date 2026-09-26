'use client';

import { type FormGroupItemType } from '@lobehub/ui';
import { Form } from '@lobehub/ui';
import { Switch } from '@lobehub/ui/base-ui';
import { memo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import AutoSaveHint from '@/components/Editor/AutoSaveHint';
import { SettingsSectionSkeleton } from '@/components/Skeleton';
import { FORM_STYLE } from '@/const/layoutTokens';
import { refreshCollaborationConnections } from '@/features/Collaboration/connection';
import { SettingsSearchAnchor } from '@/features/SettingsSearch/anchor';
import { useSaveState } from '@/hooks/useSaveState';
import { useUserStore } from '@/store/user';
import { preferenceSelectors } from '@/store/user/selectors';

const Collaboration = memo(() => {
  const { t } = useTranslation('setting');
  const showInCollaboration = useUserStore(preferenceSelectors.showInCollaboration);
  const [updatePreference, isUserStateInit] = useUserStore((s) => [
    s.updatePreference,
    s.isUserStateInit,
  ]);
  const { status: saveStatus, lastSavedAt, save, retry } = useSaveState();
  const saveInFlight = useRef(false);

  const retryVisibility = async () => {
    if (saveInFlight.current) return;
    saveInFlight.current = true;
    try {
      await retry();
    } finally {
      saveInFlight.current = false;
    }
  };

  if (!isUserStateInit) return <SettingsSectionSkeleton />;

  const collaboration: FormGroupItemType = {
    children: [
      {
        children: (
          <Switch
            checked={showInCollaboration}
            disabled={saveStatus === 'saving'}
            onChange={(checked) => {
              if (saveInFlight.current) return;
              saveInFlight.current = true;
              void save(async () => {
                await updatePreference({ showInCollaboration: checked });
                refreshCollaborationConnections();
              }).finally(() => {
                saveInFlight.current = false;
              });
            }}
          />
        ),
        desc: t('settingAppearance.collaboration.showInCollaboration.desc'),
        label: (
          <SettingsSearchAnchor id={'appearance-collaboration-visibility'}>
            {t('settingAppearance.collaboration.showInCollaboration.title')}
          </SettingsSearchAnchor>
        ),
        minWidth: undefined,
      },
    ],
    extra: (
      <AutoSaveHint
        lastUpdatedTime={lastSavedAt}
        saveStatus={saveStatus}
        onRetry={retryVisibility}
      />
    ),
    title: t('settingAppearance.collaboration.title'),
  };

  return (
    <Form
      collapsible={false}
      items={[collaboration]}
      itemsType={'group'}
      variant={'filled'}
      {...FORM_STYLE}
    />
  );
});

Collaboration.displayName = 'Collaboration';

export default Collaboration;
