'use client';

import { MonitorDownIcon, RefreshCwIcon } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { DeviceConnectModal, DeviceManager, useDeviceList } from '@/features/DeviceManager';

const WorkspaceDevicesSetting = memo(() => {
  const { t } = useTranslation('setting');
  const [open, setOpen] = useState(false);
  const [connectTab, setConnectTab] = useState<'cli' | 'desktop'>('desktop');
  const openConnect = (tab: 'cli' | 'desktop' = 'desktop') => {
    setConnectTab(tab);
    setOpen(true);
  };

  // The connect + refresh actions sit beside the tabs (same header pattern as
  // the workspace credential page). Shares DeviceManager's SWR entry, so
  // `mutate` refreshes the list it renders.
  const { isValidating, mutate } = useDeviceList();

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-4 justify-between">
          <div className="flex items-center gap-2">
            <Button
              loading={isValidating}
              size="icon"
              title={t('devices.actions.refresh')}
              variant="outline"
              onClick={() => mutate()}
            >
              <RefreshCwIcon />
            </Button>
            <Button size="compact" onClick={() => openConnect()}>
              <MonitorDownIcon data-icon="inline-start" />
              {t('devices.connectWizard.button')}
            </Button>
          </div>
        </div>

        <DeviceManager onConnect={openConnect} />
      </div>

      <DeviceConnectModal initialTab={connectTab} open={open} onClose={() => setOpen(false)} />
    </>
  );
});

WorkspaceDevicesSetting.displayName = 'WorkspaceDevicesSetting';

export default WorkspaceDevicesSetting;
