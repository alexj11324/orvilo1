'use client';

import { isDesktop } from '@orvilo/const';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import Form, { type FormGroupItemType } from '@/components/GroupForm';
import { Switch } from '@/components/ui/switch';
import { FORM_STYLE } from '@/const/layoutTokens';
import { SettingsSearchAnchor } from '@/features/SettingsSearch/anchor';
import { useElectronStore } from '@/store/electron';

const Desktop = memo(() => {
  const { t } = useTranslation('setting');
  const [loading, setLoading] = useState(false);
  const [appTrayVisible, setAppTrayVisible, useGetAppTrayVisible] = useElectronStore((s) => [
    s.appTrayVisible,
    s.setAppTrayVisible,
    s.useGetAppTrayVisible,
  ]);

  useGetAppTrayVisible(isDesktop);

  if (!isDesktop) return null;

  const desktop: FormGroupItemType = {
    children: [
      {
        children: (
          <Switch
            aria-busy={loading}
            checked={appTrayVisible}
            disabled={loading}
            onCheckedChange={async (checked: boolean) => {
              setLoading(true);
              try {
                await setAppTrayVisible(checked);
              } finally {
                setLoading(false);
              }
            }}
          />
        ),
        label: (
          <SettingsSearchAnchor id={'appearance-app-tray'}>
            {t('settingAppearance.appTray.title')}
          </SettingsSearchAnchor>
        ),
        minWidth: undefined,
      },
    ],
    title: t('settingAppearance.desktop.title'),
  };

  return (
    <Form
      collapsible={false}
      items={[desktop]}
      itemsType={'group'}
      variant={'filled'}
      {...FORM_STYLE}
    />
  );
});

export default Desktop;
