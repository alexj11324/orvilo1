'use client';

import { DOWNLOAD_URL } from '@orvilo/const';
import type { DeviceScope, DeviceVisibility } from '@orvilo/types';
import { cn } from 'cn';
import { DownloadIcon, MonitorDownIcon, ShieldCheckIcon, TerminalIcon } from 'lucide-react';
import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncBoundary from '@/components/AsyncBoundary';
import CommandLine from '@/components/CommandLine';
import { Modal } from '@/components/Modal';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useClientDataSWR } from '@/libs/swr';
import { getHostContext } from '@/platform';
import { cliReleaseService } from '@/services/cliRelease';
import { useElectronStore } from '@/store/electron';

import { useConnectDesktopDevice } from './useConnectDesktopDevice';

const styles = {
  footer: 'mbs-1 pbs-4 border-bs border-divider',
  index:
    'flex shrink-0 items-center justify-center size-6 rounded-full text-xs leading-5 font-semibold text-primary-text bg-primary-wash',
  line: 'flex-1 w-px mbs-1 bg-divider',
};

interface StepProps {
  children?: React.ReactNode;
  desc?: string;
  index: number;
  last?: boolean;
  title: string;
}

const Step = memo<StepProps>(({ index, title, desc, children, last }) => (
  <div className="flex gap-4">
    <div className="flex flex-col items-center">
      <span className={styles.index}>{index}</span>
      {!last && <span className={styles.line} />}
    </div>
    <div className={cn('flex flex-col flex-1 min-w-0 gap-1', !last && 'pbe-6')}>
      <div className="text-sm leading-5.5 font-medium">{title}</div>
      {desc && <div className="text-sm leading-5.5 text-foreground-tertiary">{desc}</div>}
      {children && <div className="mbs-3">{children}</div>}
    </div>
  </div>
));

interface DeviceConnectModalProps {
  initialTab?: 'cli' | 'desktop';
  onClose: () => void;
  open: boolean;
  scope: DeviceScope;
  /**
   * Workspace scope only: which pool the wizard enrolls into. The CLI enrolls
   * private (enroller-only) by default, so 'public' appends `--public` to the
   * connect command to register into the shared pool (the settings page passes
   * the active tab here).
   */
  visibility?: DeviceVisibility;
}

const DeviceConnectModal = memo<DeviceConnectModalProps>(
  ({ onClose, open, initialTab, scope, visibility }) => {
    const { t } = useTranslation('setting');
    const workspaceId = useActiveWorkspaceId();
    const isWorkspace = scope === 'workspace';
    const isDesktopHost = getHostContext().capabilities.has('window.manage');

    const [active, setActive] = useState<'cli' | 'desktop'>(initialTab ?? 'desktop');
    useEffect(() => {
      if (open) setActive(initialTab ?? 'desktop');
    }, [open, initialTab, isWorkspace]);

    const cliRelease = useClientDataSWR(open && active === 'cli' ? 'cli-release' : null, () =>
      cliReleaseService.getLatest(),
    );

    const desktop = useConnectDesktopDevice({ scope, visibility, onClose, open });
    const status = useElectronStore((s) => s.gatewayConnectionStatus);
    const fetchStatus = useElectronStore((s) => s.useFetchGatewayStatus);
    const statusQuery = fetchStatus();

    const connectCommand = isWorkspace
      ? `orvilo connect --workspace ${workspaceId ?? '<workspace-id>'}${
          visibility === 'public' ? ' --public' : ''
        } --daemon`
      : 'orvilo connect --daemon';

    const cliSteps = (
      <div className="flex flex-col">
        <Step index={1} title={t('devices.connectWizard.cli.installTitle')}>
          <AsyncBoundary
            data={cliRelease.data}
            error={cliRelease.error}
            isLoading={cliRelease.isLoading}
            onRetry={() => void cliRelease.mutate()}
          >
            {cliRelease.data?.url ? (
              <CommandLine
                command={`npm install -g '${cliRelease.data.url.replaceAll("'", "'\\''")}'`}
              />
            ) : (
              <div className="flex flex-col items-start gap-2">
                <span>{t('devices.connectWizard.cli.unavailable')}</span>
                <Button
                  render={<a href={DOWNLOAD_URL.default} rel="noreferrer" target="_blank" />}
                  size="normal"
                  variant="outline"
                >
                  {t('devices.connectWizard.cli.viewReleases')}
                </Button>
              </div>
            )}
          </AsyncBoundary>
        </Step>
        <Step index={2} title={t('devices.connectWizard.cli.loginTitle')}>
          <CommandLine command={'orvilo login'} />
        </Step>
        <Step
          last
          index={3}
          title={t('devices.connectWizard.cli.connectTitle')}
          desc={
            isWorkspace
              ? t('workspaceSetting.devices.enrollDesc')
              : t('devices.connectWizard.cli.connectDesc')
          }
        >
          <CommandLine command={connectCommand} />
        </Step>
      </div>
    );

    return (
      <Modal
        closable={!desktop.connecting}
        footer={null}
        keyboard={!desktop.connecting}
        maskClosable={!desktop.connecting}
        open={open}
        width={'min(92vw, 560px)'}
        title={
          isWorkspace
            ? t(
                visibility === 'private'
                  ? 'workspaceSetting.devices.connectTitlePrivate'
                  : 'workspaceSetting.devices.connectTitlePublic',
              )
            : t('devices.connectWizard.title')
        }
        onCancel={() => {
          if (!desktop.connecting) onClose();
        }}
      >
        <div className="flex flex-col gap-5 text-sm leading-5.5">
          {!isWorkspace && (
            <div className="text-foreground-tertiary">{t('devices.connectWizard.subtitle')}</div>
          )}

          {
            <Tabs
              value={active}
              onValueChange={(key) => {
                if (!desktop.connecting && typeof key === 'string')
                  setActive(key as 'cli' | 'desktop');
              }}
            >
              <TabsList className="flex h-9 w-full rounded-(--radius-button) group-data-horizontal/tabs:h-9">
                <TabsTrigger
                  className="flex-1 rounded-(--radius-button) transition-[color,background-color,border-color,box-shadow] duration-(--orvilo-motion-mid)"
                  value="desktop"
                >
                  <MonitorDownIcon />
                  {t('devices.connectWizard.method.desktop')}
                </TabsTrigger>
                <TabsTrigger
                  className="flex-1 rounded-(--radius-button) transition-[color,background-color,border-color,box-shadow] duration-(--orvilo-motion-mid)"
                  value="cli"
                >
                  <TerminalIcon />
                  {t('devices.connectWizard.method.cli')}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          }

          {active === 'desktop' && isDesktopHost ? (
            <div className="flex flex-col gap-4">
              <div className="font-medium">
                {desktop.identity.data?.hostname ?? t('devices.connectWizard.desktop.thisComputer')}
              </div>
              <div className="text-muted-foreground" role="status">
                {t(`devices.connectWizard.desktop.status.${status}`)}
              </div>
              <div className="text-muted-foreground">
                {t(
                  isWorkspace
                    ? visibility === 'public'
                      ? 'devices.connectWizard.desktop.workspacePublic'
                      : 'devices.connectWizard.desktop.workspacePrivate'
                    : 'devices.connectWizard.desktop.personalDesc',
                )}
              </div>
              {(desktop.error || desktop.identity.error || statusQuery.error) && (
                <Alert variant="destructive">
                  <AlertDescription>
                    {desktop.error || desktop.identity.error?.message || statusQuery.error?.message}
                  </AlertDescription>
                </Alert>
              )}
              <Button
                loading={desktop.connecting}
                size="normal"
                type="button"
                onClick={() => void desktop.connect()}
              >
                {t('devices.connectWizard.desktop.connectThisComputer')}
              </Button>
            </div>
          ) : active === 'desktop' ? (
            <div className="flex flex-col">
              <Step
                desc={t('devices.connectWizard.desktop.step1Desc')}
                index={1}
                title={t('devices.connectWizard.desktop.step1')}
              >
                <a
                  className={cn(buttonVariants({ size: 'normal', variant: 'default' }))}
                  href={DOWNLOAD_URL.default}
                  rel="noreferrer"
                  target="_blank"
                >
                  {<DownloadIcon />}
                  {t('devices.connectWizard.desktop.downloadLink')}
                </a>
              </Step>
              <Step
                desc={t('devices.connectWizard.desktop.step2Desc')}
                index={2}
                title={t('devices.connectWizard.desktop.step2')}
              />
              <Step
                last
                index={3}
                desc={t(
                  isWorkspace
                    ? 'devices.connectWizard.desktop.workspaceStepDesc'
                    : 'devices.connectWizard.desktop.step3Desc',
                )}
                title={t(
                  isWorkspace
                    ? 'devices.connectWizard.desktop.workspaceStep'
                    : 'devices.connectWizard.desktop.step3',
                )}
              />
            </div>
          ) : (
            cliSteps
          )}

          <div className={`flex items-center gap-2 ${styles.footer}`}>
            <ShieldCheckIcon className="size-4 text-foreground-tertiary" size={16} />
            <div className="text-xs leading-5 text-foreground-tertiary">
              {t('devices.connectWizard.footer')}
            </div>
          </div>
        </div>
      </Modal>
    );
  },
);

DeviceConnectModal.displayName = 'DeviceConnectModal';

export default DeviceConnectModal;
