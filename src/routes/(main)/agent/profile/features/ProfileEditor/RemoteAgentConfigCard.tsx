'use client';

import {
  HETEROGENEOUS_TYPE_LABELS,
  type RemoteHeterogeneousAgentType,
} from '@orvilo/heterogeneous-agents';
import type { HeterogeneousProviderConfig } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import { t as i18nT } from 'i18next';
import { BotIcon, CheckCircle2, MonitorSmartphone, RefreshCw, XCircle } from 'lucide-react';
import { memo, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { createModal, useModalContext } from '@/components/Modal';
import { selectItems, SelectOptionItems } from '@/components/SelectOptions';
import { Button as BaseButton, Button } from '@/components/ui/button';
import { Select, SelectContent, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useDeviceList } from '@/features/DeviceManager/useDeviceList';
import { deviceService } from '@/services/device';
import { useAgentStore } from '@/store/agent';

const styles = createStaticStyles(({ css }) => ({
  card: css`
    padding-block: 16px 4px;
    padding-inline: 16px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};

    background: ${cssVar.colorBgContainer};
  `,
  cardHeader: css`
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;

    padding-block-end: 12px;
  `,
  title: css`
    font-size: 14px;
    font-weight: 500;
  `,
  detailList: css`
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};
  `,
  detailRow: css`
    display: flex;
    gap: 16px;
    align-items: center;

    min-height: 44px;
    padding-block: 6px;

    & + & {
      border-block-start: 1px solid ${cssVar.colorBorderSecondary};
    }
  `,
  detailLabel: css`
    flex-shrink: 0;

    width: 96px;

    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
    text-transform: uppercase;
    letter-spacing: 0.04em;
  `,
  detailContent: css`
    display: flex;
    flex: 1;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;

    min-width: 0;
  `,
  deviceItem: css`
    display: flex;
    gap: 6px;
    align-items: center;
  `,
}));

interface ChangeDeviceContentProps {
  currentDeviceId?: string;
  isWorkspaceAgent: boolean;
  onConfirm: (deviceId: string) => Promise<void> | void;
  platform: RemoteHeterogeneousAgentType;
}

const ChangeDeviceContent = memo<ChangeDeviceContentProps>(
  ({ currentDeviceId, isWorkspaceAgent, onConfirm, platform }) => {
    const { t } = useTranslation('setting');
    const { close, setCanDismissByClickOutside } = useModalContext();

    const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(currentDeviceId);
    const [capabilityResult, setCapabilityResult] = useState<
      { available: boolean; reason?: string; version?: string } | undefined
    >(undefined);
    const [checkingCapability, setCheckingCapability] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
      setCanDismissByClickOutside(!saving);
    }, [saving, setCanDismissByClickOutside]);

    // Workspace-keyed SWR fetch (see useDeviceList) — the raw lambdaQuery key
    // has no workspace dimension, so the list went stale across workspace
    // switches.
    const { data: devices, isLoading: loadingDevices } = useDeviceList();

    const onlineDevices = (devices ?? []).filter(
      (d) =>
        d.online && (!isWorkspaceAgent || (d.scope === 'workspace' && d.visibility === 'public')),
    );

    const deviceOptions = onlineDevices.map((d) => ({
      label: (
        <div className={styles.deviceItem}>
          <BotIcon size={14} />
          <span>{d.hostname}</span>
          <Badge style={{ marginInlineEnd: 0 }} variant="success-light">
            {t('platformAgentConfig.device.online')}
          </Badge>
        </div>
      ),
      title: d.hostname || d.deviceId,
      value: d.deviceId,
    }));

    const checkCapability = useCallback(
      async (deviceId: string) => {
        setCheckingCapability(true);
        setCapabilityResult(undefined);
        try {
          const result = await deviceService.checkCapability({
            deviceId,
            platform,
          });
          setCapabilityResult(result);
        } catch {
          setCapabilityResult({ available: false, reason: 'Check failed' });
        } finally {
          setCheckingCapability(false);
        }
      },
      [platform],
    );

    const handleDeviceSelect = useCallback(
      (dId: string) => {
        setSelectedDeviceId(dId);
        void checkCapability(dId);
      },
      [checkCapability],
    );

    const handleSave = async () => {
      if (!selectedDeviceId) return;
      setSaving(true);
      try {
        await onConfirm(selectedDeviceId);
        close();
      } finally {
        setSaving(false);
      }
    };

    const capabilityOk = capabilityResult?.available === true;
    const capabilityBad = capabilityResult?.available === false;

    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3" style={{ paddingBlock: '12px 4px' }}>
          <Select
            disabled={loadingDevices}
            items={selectItems(deviceOptions)}
            value={selectedDeviceId}
            onValueChange={handleDeviceSelect}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t('platformAgentConfig.selectDevice')} />
            </SelectTrigger>
            <SelectContent>
              <SelectOptionItems options={deviceOptions} />
            </SelectContent>
          </Select>
          {checkingCapability && (
            <Badge style={{ marginInlineEnd: 0 }} variant="primary-light">
              {t('platformAgentConfig.availability.checking')}
            </Badge>
          )}
          {capabilityOk && (
            <div className="flex items-center gap-1">
              <CheckCircle2 color="var(--ant-color-success)" size={14} />
              <Badge style={{ marginInlineEnd: 0 }} variant="success-light">
                {capabilityResult?.version ?? t('platformAgentConfig.availability.available')}
              </Badge>
            </div>
          )}
          {capabilityBad && (
            <div className="flex items-center gap-1">
              <XCircle color="var(--ant-color-error)" size={14} />
              <Badge style={{ marginInlineEnd: 0 }} variant="destructive-light">
                {t('platformAgentConfig.availability.notInstalled')}
              </Badge>
            </div>
          )}
        </div>
        <div className="flex gap-2 justify-end">
          <BaseButton disabled={saving} variant="outline" onClick={close}>
            {t('cancel', { ns: 'common' })}
          </BaseButton>
          <BaseButton
            disabled={!selectedDeviceId || checkingCapability || capabilityBad}
            loading={saving}
            onClick={handleSave}
          >
            {t('platformAgentConfig.changeDevice')}
          </BaseButton>
        </div>
      </div>
    );
  },
);

ChangeDeviceContent.displayName = 'ChangeDeviceContent';

interface OpenChangeDeviceModalOptions {
  currentDeviceId?: string;
  isWorkspaceAgent: boolean;
  onConfirm: (deviceId: string) => Promise<void> | void;
  platform: RemoteHeterogeneousAgentType;
}

const openChangeDeviceModal = (options: OpenChangeDeviceModalOptions) =>
  createModal({
    content: (
      <ChangeDeviceContent
        currentDeviceId={options.currentDeviceId}
        isWorkspaceAgent={options.isWorkspaceAgent}
        platform={options.platform}
        onConfirm={options.onConfirm}
      />
    ),
    footer: null,
    maskClosable: true,
    title: i18nT('platformAgentConfig.changeDevice', { ns: 'setting' }),
    width: 400,
  });

interface RemoteAgentConfigCardProps {
  onBoundDeviceChange?: (deviceId: string) => Promise<void> | void;
  provider: HeterogeneousProviderConfig;
}

const RemoteAgentConfigCard = memo<RemoteAgentConfigCardProps>(
  ({ provider, onBoundDeviceChange }) => {
    const { t } = useTranslation('setting');

    const agentId = useAgentStore((s) => s.activeAgentId);
    const boundDeviceId = useAgentStore((s) =>
      agentId ? s.agentMap[agentId]?.agencyConfig?.boundDeviceId : undefined,
    );
    // Workspace-scoped agents are reachable by every workspace member, but a
    // personal device is only reachable by its owner. Hide personal devices
    // from the picker so workspace agents can only bind workspace devices.
    const agentWorkspaceId = useAgentStore((s) =>
      agentId ? s.agentMap[agentId]?.workspaceId : undefined,
    );
    const isWorkspaceAgent = Boolean(agentWorkspaceId);

    const [capabilityResult, setCapabilityResult] = useState<
      { available: boolean; reason?: string; version?: string } | undefined
    >(undefined);
    const [checkingCapability, setCheckingCapability] = useState(false);

    const platformName = HETEROGENEOUS_TYPE_LABELS[provider.type] ?? provider.type;

    // Workspace-keyed SWR fetch — see the comment on the sibling call above.
    const { data: devices } = useDeviceList();

    const boundDevice = devices?.find((d) => d.deviceId === boundDeviceId);

    const checkCapability = useCallback(
      async (deviceId: string) => {
        setCheckingCapability(true);
        setCapabilityResult(undefined);
        try {
          const result = await deviceService.checkCapability({
            deviceId,
            platform: provider.type as RemoteHeterogeneousAgentType,
          });
          setCapabilityResult(result);
        } catch {
          setCapabilityResult({ available: false, reason: 'Check failed' });
        } finally {
          setCheckingCapability(false);
        }
      },
      [provider.type],
    );

    useEffect(() => {
      if (boundDeviceId && boundDevice?.online) {
        void checkCapability(boundDeviceId);
      }
    }, [boundDeviceId, boundDevice?.online, checkCapability]);

    const handleOpenChangeDevice = useCallback(() => {
      openChangeDeviceModal({
        currentDeviceId: boundDeviceId,
        isWorkspaceAgent,
        onConfirm: async (deviceId) => {
          await onBoundDeviceChange?.(deviceId);
        },
        platform: provider.type as RemoteHeterogeneousAgentType,
      });
    }, [boundDeviceId, isWorkspaceAgent, onBoundDeviceChange, provider.type]);

    const renderAvailability = () => {
      if (!boundDeviceId) {
        return (
          <Badge style={{ marginInlineEnd: 0 }} variant="primary-light">
            {t('platformAgentConfig.availability.noDevice')}
          </Badge>
        );
      }
      if (!boundDevice?.online) {
        return (
          <Badge style={{ marginInlineEnd: 0 }} variant="warning-light">
            {t('platformAgentConfig.device.offline')}
          </Badge>
        );
      }
      if (checkingCapability) {
        return (
          <Badge style={{ marginInlineEnd: 0 }} variant="primary-light">
            {t('platformAgentConfig.availability.checking')}
          </Badge>
        );
      }
      if (!capabilityResult) return null;
      if (capabilityResult.available) {
        return (
          <div className="flex items-center gap-1">
            <CheckCircle2 color="var(--ant-color-success)" size={14} />
            <Badge style={{ marginInlineEnd: 0 }} variant="success-light">
              {capabilityResult.version ?? t('platformAgentConfig.availability.available')}
            </Badge>
          </div>
        );
      }
      return (
        <div className="flex items-center gap-1">
          <XCircle color="var(--ant-color-error)" size={14} />
          <Badge style={{ marginInlineEnd: 0 }} variant="destructive-light">
            {t('platformAgentConfig.availability.notInstalled')}
          </Badge>
        </div>
      );
    };

    return (
      <div className={cn('flex flex-col gap-0', styles.card)}>
        <div className={styles.cardHeader}>
          <div className="flex items-center gap-2">
            <MonitorSmartphone size={16} />
            <div className={cn('font-semibold', styles.title)}>
              {t('platformAgentConfig.title')}
            </div>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <span style={{ display: 'inline-flex' }}>
                    <ActionIcon
                      aria-label={t('platformAgentConfig.redetect')}
                      disabled={!boundDeviceId || checkingCapability}
                      icon={RefreshCw}
                      loading={checkingCapability}
                      size="small"
                      onClick={() => boundDeviceId && void checkCapability(boundDeviceId)}
                    />
                  </span>
                }
              />
              <TooltipContent>{t('platformAgentConfig.redetect')}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className={styles.detailList}>
          <div className={styles.detailRow}>
            <div className={styles.detailLabel}>{t('platformAgentConfig.platform.label')}</div>
            <div className={styles.detailContent}>
              <Badge style={{ marginInlineEnd: 0 }} variant="primary-light">
                {platformName}
              </Badge>
            </div>
          </div>
          <div className={styles.detailRow}>
            <div className={styles.detailLabel}>{t('platformAgentConfig.device.label')}</div>
            <div className={styles.detailContent}>
              {boundDevice ? (
                <div className="flex items-center gap-1.5">
                  <div className="truncate" style={{ fontSize: 14 }}>
                    {boundDevice.hostname}
                  </div>
                  <Badge
                    color={boundDevice.online ? 'success' : 'default'}
                    style={{ marginInlineEnd: 0 }}
                    variant="primary-light"
                  >
                    {boundDevice.online
                      ? t('platformAgentConfig.device.online')
                      : t('platformAgentConfig.device.offline')}
                  </Badge>
                </div>
              ) : (
                <Badge style={{ marginInlineEnd: 0 }} variant="primary-light">
                  {t('platformAgentConfig.device.none')}
                </Badge>
              )}
            </div>
          </div>
          <div className={styles.detailRow}>
            <div className={styles.detailLabel}>{t('platformAgentConfig.availability.label')}</div>
            <div className={styles.detailContent}>{renderAvailability()}</div>
          </div>
          <div className={styles.detailRow}>
            <div className={styles.detailLabel} />
            <div className={styles.detailContent}>
              <Button size="sm" variant="outline" onClick={handleOpenChangeDevice}>
                {t('platformAgentConfig.changeDevice')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  },
);

RemoteAgentConfigCard.displayName = 'RemoteAgentConfigCard';

export default RemoteAgentConfigCard;
