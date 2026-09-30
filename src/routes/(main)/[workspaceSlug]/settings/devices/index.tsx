'use client';

import type { DeviceVisibility } from '@orvilo/types';
import { LockIcon, RefreshCwIcon, TerminalIcon, UsersIcon } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
          <Tabs value={visibility} onValueChange={(key) => setVisibility(key as DeviceVisibility)}>
            <TabsList>
              <TabsTrigger value="public">
                <UsersIcon />
                {t('devices.visibilityTabs.workspace')}
              </TabsTrigger>
              <TabsTrigger value="private">
                <LockIcon />
                {t('devices.visibilityTabs.private')}
              </TabsTrigger>
            </TabsList>
          </Tabs>
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
            <Button onClick={() => setOpen(true)}>
              <TerminalIcon data-icon="inline-start" />
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
