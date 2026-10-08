'use client';

import { isDesktop } from '@orvilo/const';
import { createStaticStyles } from 'antd-style';
import isEqual from 'fast-deep-equal';
import { memo, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import Form, { type FormGroupItemType, type FormItemProps } from '@/components/GroupForm';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { FORM_STYLE } from '@/const/layoutTokens';
import SettingHeader from '@/features/Settings/features/SettingHeader';
import { SettingsSearchAnchor } from '@/features/SettingsSearch/anchor';
import { getHostPort, hostResultOr } from '@/platform';
import { serverConfigSelectors, useServerConfigStore } from '@/store/serverConfig';
import { useUserStore } from '@/store/user';
import { settingsSelectors } from '@/store/user/selectors';

type UpdateChannelValue = 'canary' | 'stable';

const styles = createStaticStyles(({ css }) => ({
  labItem: css`
    .ant-form-item-row {
      align-items: center !important;
    }
  `,
}));

const Page = memo(() => {
  const { t } = useTranslation('setting');

  const general = useUserStore((s) => settingsSelectors.currentSettings(s).general, isEqual);
  const defaultAgentGatewayModeEnabled = useUserStore(
    (s) => settingsSelectors.defaultAgentConfig(s).chatConfig?.disableGatewayMode !== true,
  );
  const [setSettings, updateDefaultAgent, isUserStateInit, isUserStateInitError, refreshUserState] =
    useUserStore((s) => [
      s.setSettings,
      s.updateDefaultAgent,
      s.isUserStateInit,
      s.isUserStateInitError,
      s.refreshUserState,
    ]);
  const [loading, setLoading] = useState(false);

  const enableGatewayMode = useServerConfigStore(serverConfigSelectors.enableGatewayMode);

  const [channel, setChannel] = useState<UpdateChannelValue>('stable');

  useEffect(() => {
    if (!isDesktop) return;
    getHostPort()
      .updater.getUpdateChannel()
      .then((value) => setChannel(hostResultOr(value, 'stable')))
      .catch(() => {});
  }, []);

  const handleChannelChange = useCallback((value: UpdateChannelValue) => {
    setChannel(value);
    void getHostPort().updater.setUpdateChannel(value);
  }, []);

  const handleGatewayModeChange = useCallback(
    (checked: boolean) => {
      updateDefaultAgent({
        config: { chatConfig: { disableGatewayMode: checked ? false : true } },
      });
    },
    [updateDefaultAgent],
  );

  if (!isUserStateInit) {
    // A failed user-state init must show error + Retry, not a permanent skeleton
    //
    if (isUserStateInitError)
      return (
        <AsyncError
          error={isUserStateInitError}
          variant={'block'}
          onRetry={() => refreshUserState()}
        />
      );
    return (
      <div aria-busy="true" className="flex flex-col gap-3">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton className="h-4 w-full" key={index} />
        ))}
      </div>
    );
  }

  const advancedGroup: FormGroupItemType = {
    children: [
      {
        children: <Switch />,
        desc: t('settingCommon.devMode.desc'),
        label: (
          <SettingsSearchAnchor id={'advanced-dev-mode'}>
            {t('settingCommon.devMode.title')}
          </SettingsSearchAnchor>
        ),
        minWidth: undefined,
        name: 'isDevMode',
        trigger: 'onCheckedChange',
        valuePropName: 'checked',
      },
      ...(enableGatewayMode
        ? [
            {
              children: (
                <Switch
                  checked={defaultAgentGatewayModeEnabled}
                  onCheckedChange={handleGatewayModeChange}
                />
              ),
              className: styles.labItem,
              desc: t('tab.advanced.gatewayMode.desc'),
              label: (
                <SettingsSearchAnchor id={'advanced-gateway-mode'}>
                  {t('tab.advanced.gatewayMode.title')}
                </SettingsSearchAnchor>
              ),
              minWidth: undefined,
            } satisfies FormItemProps,
          ]
        : []),
    ],
    extra: loading && <Spinner className="opacity-50" />,
    title: t('tab.advanced.toolsAndDiagnostics.title'),
  };

  const channelOptions = [
    { label: t('tab.advanced.updateChannel.stable'), value: 'stable' as const },
    { label: t('tab.advanced.updateChannel.canary'), value: 'canary' as const },
  ];

  const updateChannelGroup: FormGroupItemType = {
    children: [
      {
        children: (
          <Select
            items={channelOptions}
            value={channel}
            onValueChange={(value) => {
              if (value !== null) handleChannelChange(value);
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {channelOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ),
        desc: t('tab.advanced.updateChannel.desc'),
        label: (
          <SettingsSearchAnchor id={'advanced-update-channel'}>
            {t('tab.advanced.updateChannel.title')}
          </SettingsSearchAnchor>
        ),
      },
    ],
    title: t('tab.advanced.appUpdates.title'),
  };

  const items = isDesktop ? [advancedGroup, updateChannelGroup] : [advancedGroup];

  return (
    <>
      <SettingHeader title={t('tab.advanced')} />
      <Form
        collapsible={false}
        initialValues={general}
        items={items}
        itemsType={'group'}
        variant={'filled'}
        onValuesChange={async (v) => {
          setLoading(true);
          await setSettings({ general: v });
          setLoading(false);
        }}
        {...FORM_STYLE}
      />
    </>
  );
});

export default Page;
