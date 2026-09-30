'use client';

import { Button, Tabs } from '@lobehub/ui/base-ui';
import type { DeviceVisibility } from '@orvilo/types';
import { LockIcon, RefreshCwIcon, TerminalIcon, UsersIcon } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DeviceConnectModal, DeviceManager, useDeviceList } from '@/features/DeviceManager';

/**
 * Workspace device settings: two pools behind tabs —
 * - Workspace: the shared (public-visibility) pool every member sees.
 * - Private: the caller's own private enrollments in this workspace.
 * The tab also parameterises the connect wizard, so a device enrolled from the
 * Private tab registers as private (`lh connect … --private`).
 */
const WorkspaceDevicesSetting = memo(() => {
  const { t } = useTranslation('setting');
  const [open, setOpen] = useState(false);
  const [visibility, setVisibility] = useState<DeviceVisibility>('public');

  // The connect + refresh actions sit beside the tabs (same header pattern as
  // the workspace credential page). Shares DeviceManager's SWR entry, so
  // `mutate` refreshes the list it renders.
  const { isValidating, mutate } = useDeviceList();

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4 justify-between">
          <Tabs
            activeKey={visibility}
            items={[
              {
                icon: <UsersIcon />,
                key: 'public',
                label: t('devices.visibilityTabs.workspace'),
              },
              {
                icon: <LockIcon />,
                key: 'private',
                label: t('devices.visibilityTabs.private'),
              },
            ]}
            onChange={(key) => setVisibility(key as DeviceVisibility)}
          />
          <div className="flex items-center gap-2">
            <Button
              icon={<RefreshCwIcon />}
              loading={isValidating}
              title={t('devices.actions.refresh')}
              onClick={() => mutate()}
            />
            <Button icon={<TerminalIcon />} type={'primary'} onClick={() => setOpen(true)}>
              {t('devices.empty.methodCli.title')}
            </Button>
          </div>
        </div>

        <DeviceManager
          key={visibility}
          scope={'workspace'}
          visibility={visibility}
          onConnect={() => setOpen(true)}
        />
      </div>

      <DeviceConnectModal
        open={open}
        scope={'workspace'}
        visibility={visibility}
        onClose={() => setOpen(false)}
      />
    </>
  );
});

WorkspaceDevicesSetting.displayName = 'WorkspaceDevicesSetting';

export default WorkspaceDevicesSetting;
