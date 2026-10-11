'use client';

import { isDesktop } from '@orvilo/const';
import type { DeviceScope, DeviceVisibility } from '@orvilo/types';
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

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncBoundary from '@/components/AsyncBoundary';
import SharedListSkeleton from '@/components/ListSkeleton';
import { useElectronStore } from '@/store/electron';

import DeviceDetailPanel from './DeviceDetailPanel';
import DeviceItem from './DeviceItem';
import { useDeviceList } from './useDeviceList';

const styles = {
  badge:
    'py-0.25 px-2 rounded-full text-xs leading-5 font-medium text-primary-text bg-primary-wash',
  capabilityCard: 'p-4 border border-divider rounded-(--radius-card) bg-card',
  capabilityIcon:
    'flex items-center justify-center size-9 rounded-(--radius-card) text-muted-foreground bg-muted',
  emptyCard: 'overflow-hidden border border-divider rounded-(--radius-card) bg-card',
  plainCol: 'overflow-hidden min-w-0 rounded-(--radius-card)',
  emptyHero: 'py-10 px-8 text-center bg-fill-quaternary',
  heroIcon:
    'flex items-center justify-center size-14 rounded-(--radius-card) text-foreground bg-selected',
  option:
    'cursor-pointer p-5 bg-card transition-[background-color] duration-(--orvilo-motion-fast) ease-in-out hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2 motion-reduce:transition-none',
  optionGrid: 'grid grid-cols-2 gap-px border-bs border-divider bg-divider',
  optionIcon:
    'flex shrink-0 items-center justify-center size-10 rounded-(--radius-card) text-muted-foreground bg-muted',
  detailCol: 'self-stretch min-w-0 border border-divider rounded-(--radius-card) bg-card',
  listCol: 'overflow-hidden min-w-0 border border-divider rounded-(--radius-card) bg-card',
  listScroll: 'overflow-y-auto max-h-120',
};

interface ConnectOptionProps {
  badge?: string;
  desc: string;
  icon: LucideIcon;
  onClick: () => void;
  title: string;
}

const ConnectOption = memo<ConnectOptionProps>(({ icon: Icon, title, desc, badge, onClick }) => (
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
      <Icon size={16} />
    </span>
    <div className="flex flex-col flex-1 min-w-0 gap-1">
      <div className="flex items-center gap-2">
        <div className="text-sm leading-5.5 font-medium">{title}</div>
        {badge && <span className={styles.badge}>{badge}</span>}
      </div>
      <div className="text-xs leading-5 text-foreground-tertiary">{desc}</div>
    </div>
    <ChevronRightIcon className="size-4 text-foreground-quaternary" size={16} />
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
      <div className="text-xs text-muted-foreground font-medium">
        {t('devices.capabilities.title')}
      </div>
      <div className="flex gap-4">
        {items.map((cap) => (
          <div className={`flex flex-col flex-1 gap-3 ${styles.capabilityCard}`} key={cap.title}>
            <span className={styles.capabilityIcon}>
              <cap.icon size={16} />
            </span>
            <div className="flex flex-col gap-1">
              <div className="text-sm leading-5.5 font-medium">{cap.title}</div>
              <div className="text-xs leading-5 text-foreground-tertiary">{cap.desc}</div>
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
    <div className={`flex flex-col ${bordered ? 'p-1' : 'p-0'}`}>
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

  // Workspace enrollment has its own ID; resolve it through the personal share map.
  const workspaceId = useActiveWorkspaceId();
  const useFetchDeviceInfo = useElectronStore((s) => s.useFetchGatewayDeviceInfo);
  const gatewayDeviceInfo = useElectronStore((s) => s.gatewayDeviceInfo);
  useFetchDeviceInfo();
  const personal = data?.find(
    (d) => d.scope === 'personal' && d.deviceId === gatewayDeviceInfo?.deviceId,
  );
  const currentDeviceId = isDesktop
    ? isWorkspace
      ? personal?.sharedWorkspaces?.find((share) => share.workspaceId === workspaceId)?.deviceId
      : gatewayDeviceInfo?.deviceId
    : undefined;

  const [selectedId, setSelectedId] = useState<string>();

  // ─── Empty state: onboarding hero + connect options + capabilities ───
  // Now gated by AsyncBoundary so a *failed* device fetch renders a failure +
  // Retry instead of this "connect your first device" onboarding (which falsely
  // told the user they own no devices — ux Read §1.1 error-as-empty trap).
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
          <div className="text-xl leading-7 font-semibold">
            {t(isWorkspace ? 'workspaceSetting.devices.heroTitle' : 'devices.empty.title')}
          </div>
          <div className="max-w-110 text-sm leading-5.5 text-muted-foreground">
            {t(isWorkspace ? 'workspaceSetting.devices.heroDesc' : 'devices.empty.desc')}
          </div>
        </div>

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
            className={`flex flex-col gap-0.5 ${styles.listScroll} ${isWorkspace ? 'p-1' : 'p-0'}`}
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
