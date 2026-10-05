'use client';

import { DOWNLOAD_URL } from '@orvilo/const';
import type { DeviceScope, DeviceVisibility } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { DownloadIcon, MonitorDownIcon, ShieldCheckIcon, TerminalIcon } from 'lucide-react';
import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncBoundary from '@/components/AsyncBoundary';
import CommandLine from '@/components/CommandLine';
import ImperativeModal from '@/components/ImperativeModal';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useClientDataSWR } from '@/libs/swr';
import { cliReleaseService } from '@/services/cliRelease';

const styles = createStaticStyles(({ css }) => ({
  footer: css`
    margin-block-start: 4px;
    padding-block-start: 16px;
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};
  `,
  index: css`
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;

    width: 24px;
    height: 24px;
    border-radius: 50%;

    font-size: ${cssVar.fontSizeSM};
    font-weight: 600;
    color: ${cssVar.colorPrimary};

    background: ${cssVar.colorPrimaryBg};
  `,
  line: css`
    flex: 1;
    width: 1px;
    margin-block-start: 4px;
    background: ${cssVar.colorBorderSecondary};
  `,
}));

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
    <div
      className="flex flex-col flex-1 gap-1"
      style={{ minWidth: 0, paddingBlockEnd: last ? 0 : 24 }}
    >
      <div className="font-medium">{title}</div>
      {desc && (
        <div className="leading-[1.6]" style={{ color: cssVar.colorTextTertiary }}>
          {desc}
        </div>
      )}
      {children && <div style={{ marginBlockStart: 12 }}>{children}</div>}
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

/**
 * Device enrollment wizard, shared by the personal and workspace device pages.
 * - Personal: Desktop (auto-connect) + CLI tabs.
 * - Workspace: CLI-only (shared machines are headless), and the connect step
 *   carries the `--workspace <id>` flag that routes the device to the workspace
 *   principal (plus `--public` when enrolling from the Workspace tab — the CLI
 *   defaults to a private enrollment). Member+ on the server.
 */
const DeviceConnectModal = memo<DeviceConnectModalProps>(
  ({ onClose, open, initialTab, scope, visibility }) => {
    const { t } = useTranslation('setting');
    const workspaceId = useActiveWorkspaceId();
    const isWorkspace = scope === 'workspace';

    const [active, setActive] = useState<'cli' | 'desktop'>(initialTab ?? 'desktop');
    useEffect(() => {
      if (open) setActive(isWorkspace ? 'cli' : (initialTab ?? 'desktop'));
    }, [open, initialTab, isWorkspace]);

    const cliRelease = useClientDataSWR(
      open && (isWorkspace || active === 'cli') ? 'cli-release' : null,
      () => cliReleaseService.getLatest(),
    );

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
      <ImperativeModal
        footer={null}
        open={open}
        width={560}
        title={
          isWorkspace
            ? t(
                visibility === 'private'
                  ? 'workspaceSetting.devices.connectTitlePrivate'
                  : 'workspaceSetting.devices.connectTitlePublic',
              )
            : t('devices.connectWizard.title')
        }
        onCancel={onClose}
      >
        <div className="flex flex-col gap-5">
          {!isWorkspace && (
            <div style={{ color: cssVar.colorTextTertiary }}>
              {t('devices.connectWizard.subtitle')}
            </div>
          )}

          {isWorkspace ? null : (
            <Tabs
              value={active}
              onValueChange={(key) => {
                if (typeof key === 'string') setActive(key as 'cli' | 'desktop');
              }}
            >
              <TabsList style={{ display: 'flex', width: '100%' }}>
                <TabsTrigger style={{ flex: 1 }} value="desktop">
                  <MonitorDownIcon />
                  {t('devices.connectWizard.method.desktop')}
                </TabsTrigger>
                <TabsTrigger style={{ flex: 1 }} value="cli">
                  <TerminalIcon />
                  {t('devices.connectWizard.method.cli')}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}

          {!isWorkspace && active === 'desktop' ? (
            <div className="flex flex-col">
              <Step
                desc={t('devices.connectWizard.desktop.step1Desc')}
                index={1}
                title={t('devices.connectWizard.desktop.step1')}
              >
                <a href={DOWNLOAD_URL.default} rel="noreferrer" target="_blank">
                  <Button variant="default">
                    {<DownloadIcon />}
                    {t('devices.connectWizard.desktop.downloadLink')}
                  </Button>
                </a>
              </Step>
              <Step
                desc={t('devices.connectWizard.desktop.step2Desc')}
                index={2}
                title={t('devices.connectWizard.desktop.step2')}
              />
              <Step
                last
                desc={t('devices.connectWizard.desktop.step3Desc')}
                index={3}
                title={t('devices.connectWizard.desktop.step3')}
              />
            </div>
          ) : (
            cliSteps
          )}

          <div className={`flex items-center gap-2 ${styles.footer}`}>
            <ShieldCheckIcon size={14} style={{ color: cssVar.colorTextTertiary }} />
            <div className="text-[12px]" style={{ color: cssVar.colorTextTertiary }}>
              {t('devices.connectWizard.footer')}
            </div>
          </div>
        </div>
      </ImperativeModal>
    );
  },
);

DeviceConnectModal.displayName = 'DeviceConnectModal';

export default DeviceConnectModal;
