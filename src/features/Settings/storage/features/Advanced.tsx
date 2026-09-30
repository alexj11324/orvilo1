'use client';

import type { FormGroupItemType } from '@lobehub/ui';
import { Form } from '@lobehub/ui';
import { confirmModal, toast } from '@lobehub/ui/base-ui';
import { BRANDING_NAME } from '@orvilo/business-const';
import { HardDriveDownload, HardDriveUpload } from 'lucide-react';
import { createElement, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import AccountDeletion from '@/business/client/features/AccountDeletion';
import { useTransferAgentsFormItem } from '@/business/client/hooks/useTransferAgentsFormItem';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { FORM_STYLE } from '@/const/layoutTokens';
import DataImporter from '@/features/DataImporter';
import { SettingsSearchAnchor } from '@/features/SettingsSearch/anchor';
import { configService } from '@/services/config';
import { useServerConfigStore } from '@/store/serverConfig';
import { featureFlagsSelectors, serverConfigSelectors } from '@/store/serverConfig/selectors';
import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/selectors';

const AdvancedActions = () => {
  const { t } = useTranslation(['setting', 'common']);

  const { hideDocs } = useServerConfigStore(featureFlagsSelectors);
  const enableBusinessFeatures = useServerConfigStore(serverConfigSelectors.enableBusinessFeatures);
  const checked = useUserStore(userGeneralSettingsSelectors.telemetry);
  const transferAgentsFormItems = useTransferAgentsFormItem();
  const resetSettings = useUserStore((s) => s.resetSettings);
  const updateGeneralConfig = useUserStore((s) => s.updateGeneralConfig);

  const handleReset = useCallback(() => {
    confirmModal({
      cancelText: t('cancel', { ns: 'common' }),
      content: t('danger.reset.confirm'),
      okButtonProps: { danger: true },
      okText: t('danger.reset.action'),
      onOk: () => {
        resetSettings();
        toast.success(t('danger.reset.success'));
      },
      title: t('danger.reset.title'),
    });
  }, [resetSettings, t]);

  const renderExportButtonFormItem = () => {
    return {
      children: (
        <Button
          variant="outline"
          onClick={() => {
            configService.exportAll();
          }}
        >
          {createElement(HardDriveUpload, {})}
          {t('storage.actions.export.button')}
        </Button>
      ),
      label: (
        <SettingsSearchAnchor id={'storage-export'}>
          {t('storage.actions.export.title')}
        </SettingsSearchAnchor>
      ),
      layout: 'horizontal',
      minWidth: undefined,
    } as const;
  };

  const system: FormGroupItemType = {
    children: [
      {
        children: (
          <DataImporter>
            <Button variant="outline">
              {createElement(HardDriveDownload, {})}
              {t('storage.actions.import.button')}
            </Button>
          </DataImporter>
        ),
        label: (
          <SettingsSearchAnchor id={'storage-import'}>
            {t('storage.actions.import.title')}
          </SettingsSearchAnchor>
        ),
        layout: 'horizontal',
        minWidth: undefined,
      },
      ...(enableBusinessFeatures ? [renderExportButtonFormItem()] : []),
      {
        children: (
          <Button variant="destructive" onClick={handleReset}>
            {t('danger.reset.action')}
          </Button>
        ),
        desc: t('danger.reset.desc'),
        label: (
          <SettingsSearchAnchor id={'storage-reset'}>
            {t('danger.reset.title')}
          </SettingsSearchAnchor>
        ),
        layout: 'horizontal',
        minWidth: undefined,
      },
    ],
    title: t('storage.actions.title'),
  };

  const analytics: FormGroupItemType = {
    children: [
      {
        children: (
          <Switch
            checked={!!checked}
            onCheckedChange={(value) => {
              updateGeneralConfig({ telemetry: value });
            }}
          />
        ),
        desc: t('analytics.telemetry.desc', { appName: BRANDING_NAME }),
        label: (
          <SettingsSearchAnchor id={'storage-telemetry'}>
            {t('analytics.telemetry.title')}
          </SettingsSearchAnchor>
        ),
        minWidth: undefined,
        trigger: 'onCheckedChange',
        valuePropName: 'checked',
      },
    ],
    title: t('analytics.title'),
  };

  const dataMigration: FormGroupItemType | undefined = transferAgentsFormItems
    ? {
        children: transferAgentsFormItems,
        title: t('storage.migration.title'),
      }
    : undefined;

  return (
    <>
      <Form
        collapsible={false}
        itemsType={'group'}
        variant={'filled'}
        items={[
          ...(hideDocs ? [analytics] : []),
          ...(dataMigration ? [dataMigration] : []),
          system,
        ]}
        {...FORM_STYLE}
      />
      {enableBusinessFeatures && <AccountDeletion />}
    </>
  );
};

export default AdvancedActions;
