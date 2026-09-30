'use client';

import { isDesktop } from '@orvilo/const';
import type { DeviceScope, DeviceVisibility } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import {
  ChevronRightIcon,
  FolderCogIcon,
  type LucideIcon,
  MonitorDownIcon,
  ServerIcon,
  TerminalIcon,
  ZapIcon,
} from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncBoundary from '@/components/AsyncBoundary';
import SharedListSkeleton from '@/components/ListSkeleton';
import { Button } from '@/components/ui/button';
import { useElectronStore } from '@/store/electron';

import DeviceDetailPanel from './DeviceDetailPanel';
import DeviceItem from './DeviceItem';
import { useDeviceList } from './useDeviceList';

const styles = createStaticStyles(({ css }) => ({
  // ─── Onboarding empty state ───
  badge: css`
    padding-block: 1px;
    padding-inline: 8px;
    border-radius: 999px;

    font-size: ${cssVar.fontSizeSM};
    font-weight: 500;
    color: ${cssVar.colorPrimary};

    background: ${cssVar.colorPrimaryBg};
  `,
  capabilityCard: css`
    padding: 16px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};
    background: ${cssVar.colorBgContainer};
  `,
  capabilityIcon: css`
    display: flex;
    align-items: center;
    justify-content: center;

    width: 36px;
    height: 36px;
    border-radius: ${cssVar.borderRadius};

    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorFillTertiary};
  `,
  emptyCard: css`
    overflow: hidden;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};
    background: ${cssVar.colorBgContainer};
  `,
  // The personal page renders inside a settings form card, so the list and the
  // onboarding state drop their own card chrome — one frame, not two nested.
  plainCol: css`
    overflow: hidden;
    min-width: 0;
    border-radius: ${cssVar.borderRadiusLG};
  `,
  emptyHero: css`
    padding-block: 40px;
    padding-inline: 32px;
    text-align: center;
    background: ${cssVar.colorFillQuaternary};
  `,
  heroIcon: css`
    display: flex;
    align-items: center;
    justify-content: center;

    width: 56px;
    height: 56px;
    border-radius: ${cssVar.borderRadiusLG};

    color: ${cssVar.colorText};

    background: ${cssVar.colorFillSecondary};
  `,
  option: css`
    cursor: pointer;
    padding: 20px;
    background: ${cssVar.colorBgContainer};
    transition: background 0.15s ease;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }

    &:focus-visible {
      outline: 2px solid ${cssVar.colorPrimary};
      outline-offset: -2px;
    }

    @media (prefers-reduced-motion: reduce) {
      transition: none;
    }
  `,
  optionGrid: css`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1px;

    border-block-start: 1px solid ${cssVar.colorBorderSecondary};

    background: ${cssVar.colorBorderSecondary};
  `,
  optionIcon: css`
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;

    width: 40px;
    height: 40px;
    border-radius: ${cssVar.borderRadius};

    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorFillTertiary};
  `,
  // ─── Master-detail surfaces ───
  detailCol: css`
    align-self: stretch;

    min-width: 0;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};

    background: ${cssVar.colorBgContainer};
  `,
  listCol: css`
    overflow: hidden;

    min-width: 0;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};

    background: ${cssVar.colorBgContainer};
  `,
  listScroll: css`
    overflow-y: auto;

    /* Cap the list so long fleets (servers / CLI agents) stay scrollable instead
       of pushing the page — pairs with the detail panel sitting beside it. */
    max-height: 480px;
  `,
}));

interface ConnectOptionProps {
  badge?: string;
  desc: string;
  icon: LucideIcon;
  onClick: () => void;
  title: string;
}

const ConnectOption = memo<ConnectOptionProps>(({ icon, title, desc, badge, onClick }) => (
  <div
    className={`flex items-start gap-4 ${styles.option}`}
    role={'button'}
    tabIndex={0}
    onClick={onClick}
    onKeyDown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick();
      }
    }}
  >
    <span className={styles.optionIcon}>
      <icon size={20} />
    </span>
    <div className="flex flex-col flex-1 gap-1" style={{ minWidth: 0 }}>
      <div className="flex items-center gap-2">
        <div className="font-medium">{title}</div>
        {badge && <span className={styles.badge}>{badge}</span>}
      </div>
      <div className="text-[12px]" style={{ color: cssVar.colorTextTertiary }}>
        {desc}
      </div>
    </div>
    <ChevronRightIcon size={16} style={{ color: cssVar.colorTextQuaternary }} />
  </div>
));

const Capabilities = memo(() => {
  const { t } = useTranslation('setting');
  const items: { desc: string; icon: LucideIcon; title: string }[] = [
    {
      desc: t('devices.capabilities.files.desc'),
      icon: FolderCogIcon,
      title: t('devices.capabilities.files.title'),
    },
    {
      desc: t('devices.capabilities.commands.desc'),
      icon: TerminalIcon,
      title: t('devices.capabilities.commands.title'),
    },
    {
      desc: t('devices.capabilities.tools.desc'),
      icon: ZapIcon,
      title: t('devices.capabilities.tools.title'),
    },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="text-[12px] text-muted-foreground font-medium">
        {t('devices.capabilities.title')}
      </div>
      <div className="flex gap-4">
        {items.map((cap) => (
          <div className={`flex flex-col flex-1 gap-3 ${styles.capabilityCard}`} key={cap.title}>
            <span className={styles.capabilityIcon}>
              <cap.icon size={18} />
            </span>
            <div className="flex flex-col gap-1">
              <div className="font-medium">{cap.title}</div>
              <div className="text-[12px]" style={{ color: cssVar.colorTextTertiary }}>
                {cap.desc}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

// Loading placeholder that reuses the list-card chrome and only skeletonises the
// row text — loading → loaded is a content swap, not a relayout (ux §4.1).
const ListSkeleton = memo<{ bordered?: boolean }>(({ bordered }) => (
  <div className={`flex flex-col flex-1 ${bordered ? styles.listCol : styles.plainCol}`}>
    <div className="flex flex-col" style={{ padding: bordered ? 4 : 0 }}>
      <SharedListSkeleton />
    </div>
  </div>
));

interface DeviceManagerProps {
  /** Open the enrollment wizard (the modal is owned by the route). */
  onConnect: (tab?: 'cli' | 'desktop') => void;
  /** Which device pool this surface manages. */
  scope: DeviceScope;
  /**
   * Workspace scope only: narrow the list to one visibility tab — 'public'
   * (shared pool) or 'private' (the caller's own private enrollments). Omitted
   * → no visibility filtering (personal page).
   */
  visibility?: DeviceVisibility;
}

/**
 * Master-detail device manager shared by the personal (`/settings/devices`) and
 * workspace (`/:slug/settings/devices`) pages — list + detail panel + onboarding
 * empty state, filtered to the given `scope` (and, for workspace, the active
 * visibility tab).
 */
const DeviceManager = memo<DeviceManagerProps>(({ onConnect, scope, visibility }) => {
  const { t } = useTranslation('setting');
  const isWorkspace = scope === 'workspace';

  // Workspace-keyed SWR fetch — the shared hook every device-listing surface
  // uses (see `useDeviceList` for why the raw TRPC React Query path is wrong).
  const { data, isLoading, error, mutate } = useDeviceList();
  // `listDevices` is workspace-aware and returns both pools — keep each surface
  // to its own scope (and visibility tab). Ghost rows (`visibility: null`,
  // online but unregistered) belong to the shared pool: the server already
  // strips other members' private devices, so an unclaimed live connection can
  // only be a public-pool machine.
  const devices = (data ?? []).filter(
    (d) => d.scope === scope && (!visibility || (d.visibility ?? 'public') === visibility),
  );

  // The machine the user is on right now (desktop only) — personal pool only;
  // a workspace device is never "this machine" in the personal sense.
  const useFetchDeviceInfo = useElectronStore((s) => s.useFetchGatewayDeviceInfo);
  const gatewayDeviceInfo = useElectronStore((s) => s.gatewayDeviceInfo);
  useFetchDeviceInfo();
  const currentDeviceId = !isWorkspace && isDesktop ? gatewayDeviceInfo?.deviceId : undefined;

  const [selectedId, setSelectedId] = useState<string>();

  // ─── Empty state: onboarding hero + connect options + capabilities ───
  // Now gated by AsyncBoundary so a *failed* device fetch renders a failure +
  // Retry instead of this "connect your first device" onboarding (which falsely
  // told the user they own no devices — ux Read §1.1 error-as-empty trap).
  // Workspace machines are headless (CLI-only enrollment), so that scope gets
  // a single primary button instead of the personal page's connect-method
  // cards + capabilities. The copy is pool-agnostic; only the hero icon forks
  // between the shared (server) and private (own machine) pools.
  const isPrivatePool = isWorkspace && visibility === 'private';
  const emptyState = (
    <div className="flex flex-col gap-8">
      <div className={`flex flex-col ${isWorkspace ? styles.emptyCard : styles.plainCol}`}>
        <div className={`flex flex-col items-center gap-3 ${styles.emptyHero}`}>
          <span className={styles.heroIcon}>
            {isWorkspace && !isPrivatePool ? (
              <ServerIcon size={28} />
            ) : (
              <MonitorDownIcon size={28} />
            )}
          </span>
          <div className="text-[18px] font-semibold">
            {t(isWorkspace ? 'workspaceSetting.devices.heroTitle' : 'devices.empty.title')}
          </div>
          <div className="text-muted-foreground" style={{ maxWidth: 440 }}>
            {t(isWorkspace ? 'workspaceSetting.devices.heroDesc' : 'devices.empty.desc')}
          </div>
          {isWorkspace && (
            <Button
              style={{ marginBlockStart: 8 }}
              variant="default"
              onClick={() => onConnect('cli')}
            >
              {<TerminalIcon />}
              {t('devices.empty.methodCli.title')}
            </Button>
          )}
        </div>

        {!isWorkspace && (
          <div className={styles.optionGrid}>
            <ConnectOption
              badge={t('devices.empty.methodDesktop.badge')}
              desc={t('devices.empty.methodDesktop.desc')}
              icon={MonitorDownIcon}
              title={t('devices.empty.methodDesktop.title')}
              onClick={() => onConnect('desktop')}
            />
            <ConnectOption
              desc={t('devices.empty.methodCli.desc')}
              icon={TerminalIcon}
              title={t('devices.empty.methodCli.title')}
              onClick={() => onConnect('cli')}
            />
          </div>
        )}
      </div>

      {!isWorkspace && <Capabilities />}
    </div>
  );

  const selected = selectedId ? devices.find((d) => d.deviceId === selectedId) : undefined;
  const isCurrent = (id: string) => !!currentDeviceId && id === currentDeviceId;

  return (
    <AsyncBoundary
      data={data}
      empty={emptyState}
      error={error}
      errorVariant={'block'}
      isEmpty={devices.length === 0}
      isLoading={isLoading}
      loading={<ListSkeleton bordered={isWorkspace} />}
      onRetry={() => mutate()}
    >
      <div className="flex items-start gap-4">
        <div className={`flex flex-col flex-1 ${isWorkspace ? styles.listCol : styles.plainCol}`}>
          <div
            className={`flex flex-col gap-0.5 ${styles.listScroll}`}
            style={{ padding: isWorkspace ? 4 : 0 }}
          >
            {devices.map((device) => (
              <DeviceItem
                device={device}
                isCurrent={isCurrent(device.deviceId)}
                key={device.deviceId}
                selected={device.deviceId === selectedId}
                onSelect={() =>
                  setSelectedId((prev) => (prev === device.deviceId ? undefined : device.deviceId))
                }
              />
            ))}
          </div>
        </div>
        {selected && (
          <div className={`flex flex-col flex-1 ${styles.detailCol}`}>
            {/* keyed on deviceId so the form state resets when the selection changes */}
            <DeviceDetailPanel
              device={selected}
              isCurrent={isCurrent(selected.deviceId)}
              key={selected.deviceId}
              onClose={() => setSelectedId(undefined)}
            />
          </div>
        )}
      </div>
    </AsyncBoundary>
  );
});

DeviceManager.displayName = 'DeviceManager';

export default DeviceManager;
