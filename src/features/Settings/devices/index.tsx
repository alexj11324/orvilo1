'use client';

import { Form } from '@lobehub/ui';
import { MonitorUpIcon, RefreshCwIcon } from 'lucide-react';
import { createElement, memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { FORM_STYLE } from '@/const/layoutTokens';
import { DeviceConnectModal, DeviceManager, useDeviceList } from '@/features/DeviceManager';

import OsPermissionsPanel, { useIsMacOsDevice } from './OsPermissionsPanel';

const Page = memo(() => {
  const { t } = useTranslation('setting');
  const [open, setOpen] = useState(false);
  const [initialTab, setInitialTab] = useState<'cli' | 'desktop'>();
  // Shares DeviceManager's SWR entry, so the header actions drive the list it
  // renders — the same wiring the workspace devices page uses.
  const { data, isValidating, mutate } = useDeviceList();
  // OS grants belong to this machine's execution readiness — the surface the
  // retired desktop-onboarding permissions step moved to. macOS-only.
  const isMacOsDevice = useIsMacOsDevice();

  const handleConnect = (tab?: 'cli' | 'desktop') => {
    setInitialTab(tab);
    setOpen(true);
  };

  const devices = (data ?? []).filter((device) => device.scope === 'personal');

  return (
    <>
      <Form
        collapsible={false}
        itemsType={'group'}
        variant={'filled'}
        items={[
          {
            children: <DeviceManager scope={'personal'} onConnect={handleConnect} />,
            extra: (
              <div
                className={'flex min-w-0'}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
              >
                {devices.length > 0 && (
                  <span
                    className={'text-muted-foreground'}
                    style={{ fontSize: 12, fontWeight: 500 }}
                  >
                    {t('devices.selection.total', { count: devices.length })}
                  </span>
                )}
                <Button size="sm" variant="outline" onClick={() => handleConnect()}>
                  {createElement(MonitorUpIcon, {})}
                  {t('devices.connectWizard.button')}
                </Button>
                <Button
                  aria-busy={isValidating}
                  aria-label={t('devices.actions.refresh')}
                  disabled={isValidating}
                  size="icon-sm"
                  title={t('devices.actions.refresh')}
                  variant="ghost"
                  onClick={() => mutate()}
                >
                  {isValidating && <Spinner />}
                  {createElement(RefreshCwIcon)}
                </Button>
              </div>
            ),
            title: t('devices.title'),
          },
          ...(isMacOsDevice
            ? [
                {
                  children: <OsPermissionsPanel />,
                  title: t('devices.osPermissions.title'),
                },
              ]
            : []),
        ]}
        {...FORM_STYLE}
      />

      <DeviceConnectModal
        initialTab={initialTab}
        open={open}
        scope={'personal'}
        onClose={() => setOpen(false)}
      />
    </>
  );
});

Page.displayName = 'DevicesSettings';

export default Page;
