'use client';

import type { DeviceListItem, DeviceVisibility } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { t } from 'i18next';
import { CircleCheck, Lock, Users } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { useWorkspaceOptionLabel } from '@/business/client/hooks/useWorkspaceOptionLabel';
import { useWorkspaces } from '@/business/client/hooks/useWorkspaces';
import { confirmModal, createModal, useModalContext } from '@/components/Modal';
import { Badge as Tag } from '@/components/reui/badge';
import Select from '@/components/Select';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { createWorkspaceLambdaClient } from '@/libs/trpc/client';

import { refreshDeviceList } from './const';

const styles = createStaticStyles(({ css }) => ({
  footer: css`
    padding-block: 16px;
    padding-inline: 24px;
  `,
  optionHint: css`
    margin-inline-start: auto;
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
  optionRow: css`
    width: 100%;
    min-width: 0;
    padding-block: 2px;
  `,
  /* The trigger wraps the selected label in an inline valueText span, so the
     row can't stretch and right-aligned hints collapse next to the label —
     flex the wrapper so the trigger lays out like the dropdown options. */
  selectValue: css`
    > span {
      display: flex;
      flex: 1;
      min-width: 0;
    }
  `,
}));

interface ShareDeviceContentProps {
  device: DeviceListItem;
}

interface CompletionState {
  name: string;
  slug: string;
}

/**
 * Body of the "share to workspace" modal opened from a personal device row.
 * Mirrors the copy-agents-to-workspace modal: pick one target workspace +
 * visibility, share, then land on a success step with a jump to the target.
 * The share call runs under that workspace's scope via
 * `createWorkspaceLambdaClient` — the personal settings page has no active
 * workspace context to inherit.
 */
const ShareDeviceContent = memo<ShareDeviceContentProps>(({ device }) => {
  const { t: tSetting } = useTranslation(['setting', 'common']);
  const { close, setCanDismissByClickOutside } = useModalContext();
  const navigate = useNavigate();
  const workspaces = useWorkspaces();
  const renderWorkspaceLabel = useWorkspaceOptionLabel();

  const [targetId, setTargetId] = useState<string>();
  const [visibility, setVisibility] = useState<DeviceVisibility>('private');
  const [sharing, setSharing] = useState(false);
  const [step, setStep] = useState<'done' | 'select-target'>('select-target');
  const [completion, setCompletion] = useState<CompletionState>();

  // Workspaces this device already lives in — selectable targets exclude them.
  const sharedIds = useMemo(
    () => new Set((device.sharedWorkspaces ?? []).map((s) => s.workspaceId)),
    [device.sharedWorkspaces],
  );

  const targetOptions = useMemo(
    () =>
      workspaces.map((workspace) => {
        const shared = sharedIds.has(workspace.id);
        const isViewer = workspace.role === 'viewer';
        const disabled = shared || isViewer || !!workspace.lockedOut;
        return {
          disabled,
          label: (
            <div className={`flex items-center gap-2 ${styles.optionRow}`}>
              {renderWorkspaceLabel(workspace)}
              {shared && (
                <Tag size="sm" style={{ flex: 'none', margin: 0 }}>
                  {tSetting('devices.share.alreadyShared')}
                </Tag>
              )}
              {!shared && isViewer && (
                <span className={styles.optionHint}>{tSetting('devices.share.viewerHint')}</span>
              )}
            </div>
          ),
          title: workspace.name,
          value: workspace.id,
        };
      }),
    [workspaces, sharedIds, tSetting, renderWorkspaceLabel],
  );

  // Default to the first workspace the device can actually be shared into.
  const effectiveTargetId = targetId ?? targetOptions.find((option) => !option.disabled)?.value;

  const visibilityOptions = useMemo(
    () =>
      (
        [
          {
            desc: tSetting('workspace.general.transferScope.private.desc'),
            icon: Lock,
            label: tSetting('workspace.general.transferScope.private.label'),
            value: 'private',
          },
          {
            desc: tSetting('workspace.general.transferScope.workspace.desc'),
            icon: Users,
            label: tSetting('workspace.general.transferScope.workspace.label'),
            value: 'public',
          },
        ] as const
      ).map((item) => ({
        label: (
          <div className={`flex items-center gap-2 ${styles.optionRow}`}>
            <item.icon size={14} />
            <div style={{ fontSize: 13, fontWeight: 500 }}>{item.label}</div>
            <span className={styles.optionHint}>{item.desc}</span>
          </div>
        ),
        title: item.label,
        value: item.value,
      })),
    [tSetting],
  );

  const visibilityTagLabel = (value: DeviceVisibility) =>
    tSetting(
      value === 'public'
        ? 'devices.share.visibilityTag.public'
        : 'devices.share.visibilityTag.private',
    );

  const handleShare = async (confirmOverwrite?: boolean) => {
    const target = workspaces.find((w) => w.id === effectiveTargetId);
    if (!target) return;

    setSharing(true);
    // Lock dismissal so the mutation can't be interrupted mid-flight.
    setCanDismissByClickOutside?.(false);
    try {
      const result = await createWorkspaceLambdaClient(
        target.id,
      ).device.shareDeviceToWorkspace.mutate({
        confirmOverwrite,
        deviceId: device.deviceId,
        visibility,
      });

      // The machine is already enrolled in this workspace (e.g. directly via
      // CLI, which the share map can't link to). Nothing was written — ask
      // before overwriting its access with the choice made here.
      if (!result.success && result.alreadyEnrolled) {
        confirmModal({
          content: tSetting('devices.share.overwriteConfirmDesc', {
            current: visibilityTagLabel(result.visibility ?? 'public'),
            next: visibilityTagLabel(visibility),
          }),
          okText: tSetting('devices.share.overwriteConfirmOk'),
          onOk: () => handleShare(true),
          title: tSetting('devices.share.overwriteConfirmTitle', { name: target.name }),
        });
        return;
      }

      refreshDeviceList();
      setCompletion({ name: target.name, slug: target.slug });
      setStep('done');
    } catch (error) {
      // Server messages (e.g. PRECONDITION_FAILED when the device dropped
      // offline mid-flow) are user-facing — surface them verbatim.
      toast.error(`${target.name}: ${(error as Error).message}`);
    } finally {
      setSharing(false);
      setCanDismissByClickOutside?.(true);
    }
  };

  const goToTarget = () => {
    if (!completion) return;

    navigate(`/${completion.slug}/settings/devices`);
    close();
  };

  if (step === 'done' && completion) {
    return (
      <div className="flex flex-col items-center gap-5 justify-center" style={{ padding: 48 }}>
        <div className="flex flex-col items-center gap-3">
          <CircleCheck color={cssVar.colorSuccess} size={32} />
          <div className="font-medium">
            {tSetting('devices.share.success', { name: completion.name })}
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={close}>{tSetting('devices.share.done')}</Button>
          <Button variant="default" onClick={goToTarget}>
            {tSetting('devices.share.goToTarget', { name: completion.name })}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-4" style={{ padding: 24 }}>
        <div className="text-muted-foreground" style={{ fontSize: 13 }}>
          {tSetting('devices.share.modalDesc')}
        </div>

        {workspaces.length === 0 ? (
          <div className="flex flex-col items-center justify-center" style={{ paddingBlock: 24 }}>
            <div className="text-[12px] text-muted-foreground">
              {tSetting('devices.share.empty')}
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <div style={{ fontSize: 13, fontWeight: 500 }}>
                {tSetting('devices.share.targetLabel')}
              </div>
              <Select
                showSearch
                classNames={{ value: styles.selectValue }}
                options={targetOptions}
                placeholder={tSetting('devices.share.selectPlaceholder')}
                style={{ width: '100%' }}
                value={effectiveTargetId}
                onChange={(value) => setTargetId(value as string)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div style={{ fontSize: 13, fontWeight: 500 }}>
                {tSetting('workspace.general.transferScope.title')}
              </div>
              <Select
                classNames={{ value: styles.selectValue }}
                options={visibilityOptions}
                style={{ width: '100%' }}
                value={visibility}
                onChange={(value) => setVisibility(value as DeviceVisibility)}
              />
            </div>
          </>
        )}
      </div>

      <div className={`flex gap-2 justify-between ${styles.footer}`}>
        <Button disabled={sharing} onClick={close}>
          {tSetting('cancel', { ns: 'common' })}
        </Button>
        <Button
          disabled={!effectiveTargetId}
          loading={sharing}
          variant="default"
          onClick={() => handleShare()}
        >
          {tSetting('devices.share.confirm')}
        </Button>
      </div>
    </div>
  );
});

ShareDeviceContent.displayName = 'ShareDeviceContent';

export const openShareDeviceModal = (device: DeviceListItem) =>
  createModal({
    content: <ShareDeviceContent device={device} />,
    footer: null,
    maskClosable: false,
    styles: {
      content: { padding: 0 },
    },
    title: t('devices.share.modalTitle', { ns: 'setting' }),
    width: 'min(92vw, 520px)',
  });
