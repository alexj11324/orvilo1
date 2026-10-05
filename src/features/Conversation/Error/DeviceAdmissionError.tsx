import type { ChatMessageError } from '@orvilo/types';
import {
  LaptopIcon,
  MonitorCheckIcon,
  PlugZapIcon,
  RotateCwIcon,
  ScrollTextIcon,
} from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import ErrorAlert from '@/features/Conversation/components/ErrorAlert';
import {
  contextSelectors,
  dataSelectors,
  useConversationStore,
} from '@/features/Conversation/store';
import DeviceConnectModal from '@/features/DeviceManager/DeviceConnectModal';
import { useDeviceList } from '@/features/DeviceManager/useDeviceList';
import { useDeviceSelectorState } from '@/features/DeviceManager/useDeviceSelectorState';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';

import type { DeviceAdmissionErrorBody } from './deviceAdmission';
import {
  deviceDisplayName,
  resolveDeviceAdmissionAction,
  resolveRepairCandidates,
} from './deviceAdmission';
import { useRepairDeviceBinding } from './useRepairDeviceBinding';
import { useRetryParentMessage } from './useRetryParentMessage';

interface DeviceAdmissionErrorProps {
  /** `error.body` — carries `code` + `detail`; branches on code only. */
  body: DeviceAdmissionErrorBody;
  error?: ChatMessageError;
  id?: string;
  onRetry?: () => Promise<void> | void;
  showRetry?: boolean;
}

/**
 * Blocked-run card for device-execution admission errors (F09). Renders the
 * server-authored `detail` and offers exactly ONE action per `code` — the
 * action the admission contract names as the way out, never a generic "fix".
 */
const DeviceAdmissionError = memo<DeviceAdmissionErrorProps>(
  ({ body, error, id, onRetry, showRetry = true }) => {
    const { t } = useTranslation('chat');
    const navigate = useWorkspaceAwareNavigate();
    const topicId = useConversationStore(contextSelectors.topicId);
    const agentId = useConversationStore(contextSelectors.agentId);
    const [updateMessageError, deleteMessage] = useConversationStore((s) => [
      s.updateMessageError,
      s.deleteMessage,
    ]);
    const messageContent = useConversationStore((s) =>
      id ? dataSelectors.getDisplayMessageById(id)(s)?.content : undefined,
    );
    const { disabled, loading, retryParentMessage } = useRetryParentMessage(id ?? '');

    // The shared candidate derivation — the same pool settings/chat/admission
    // judge against. `repairCandidates` narrows it further when the server
    // named them.
    const scope = body.scope === 'workspace' ? 'workspace' : 'personal';
    const { selectableDevices } = useDeviceSelectorState({
      canSelectDevice: true,
      permissionsLoaded: true,
      scope,
    });
    const { mutate: refreshDevices } = useDeviceList();
    const repairDeviceBinding = useRepairDeviceBinding(agentId ?? '');
    const [connectOpen, setConnectOpen] = useState(false);
    const [repairingDeviceId, setRepairingDeviceId] = useState<string>();

    const repairTargets = useMemo(() => {
      const named = resolveRepairCandidates(body, selectableDevices).map((device) => ({
        deviceId: device.deviceId,
        label: deviceDisplayName(device),
      }));
      // A candidate the server named but the local inventory has not caught up
      // with still gets a row — the CAS write + server admission re-judge it.
      const known = new Set(named.map((target) => target.deviceId));
      const stale = (body.repairCandidates ?? [])
        .filter((deviceId) => !known.has(deviceId))
        .map((deviceId) => ({ deviceId, label: deviceId }));
      return [...named, ...stale];
    }, [body, selectableDevices]);

    const dismiss = useCallback(() => {
      if (!id) return;
      // Keep a turn's streamed content — only clear the error itself.
      if (messageContent && messageContent.trim() !== '') updateMessageError(id, null);
      else deleteMessage(id);
    }, [deleteMessage, id, messageContent, updateMessageError]);

    const handleRetry = useCallback(() => {
      // Re-dispatch retries the server-side inventory read; refreshing the
      // client pool clears the mirrored error state in parallel.
      void refreshDevices();
      if (onRetry) {
        void onRetry();
        return;
      }
      void retryParentMessage();
    }, [onRetry, refreshDevices, retryParentMessage]);

    const handleRepair = useCallback(
      async (deviceId: string) => {
        if (!topicId) return;
        setRepairingDeviceId(deviceId);
        try {
          const result = await repairDeviceBinding({
            deviceId,
            expectedBindingRevision: body.bindingRevision,
            expectedBoundDeviceId: body.deviceId,
            topicId,
          });
          if (result === 'binding-changed') {
            toast.error(t('deviceAdmission.bindingChanged'));
            return;
          }
          toast.success(t('deviceAdmission.repaired'));
          dismiss();
        } catch {
          toast.error(t('deviceAdmission.repairFailed'));
        } finally {
          setRepairingDeviceId(undefined);
        }
      },
      [body.bindingRevision, body.deviceId, dismiss, repairDeviceBinding, t, topicId],
    );

    const handleViewRunStatus = useCallback(() => {
      // The run-status tray lives above the composer — scroll it into view so
      // "did anything start?" is answered where the ops surface reports it.
      document.querySelector('[data-testid="chat-input"]')?.scrollIntoView({
        behavior: 'smooth',
        block: 'end',
      });
    }, []);

    const action = resolveDeviceAdmissionAction(body);
    const runId = body.operationId;

    return (
      <>
        <ErrorAlert
          closable
          showIcon
          afterClose={dismiss}
          style={{ overflow: 'hidden', position: 'relative', width: '100%' }}
          title={body.detail ?? error?.message ?? t('deviceAdmission.title')}
          type={'warning'}
          action={
            action === 'retry-inventory' ? (
              <Button
                disabled={!onRetry && disabled}
                loading={!onRetry && loading}
                size="sm"
                variant="secondary"
                onClick={handleRetry}
              >
                <RotateCwIcon size={14} /> {t('deviceAdmission.retryInventory')}
              </Button>
            ) : action === 'connect' ? (
              <Button size="sm" variant="secondary" onClick={() => setConnectOpen(true)}>
                <PlugZapIcon size={14} /> {t('deviceAdmission.connect')}
              </Button>
            ) : action === 'request-authorization' ? (
              <Button size="sm" variant="secondary" onClick={() => navigate('/settings/devices')}>
                <LaptopIcon size={14} /> {t('deviceAdmission.requestAuthorization')}
              </Button>
            ) : action === 'view-run-status' ? (
              <Button size="sm" variant="secondary" onClick={handleViewRunStatus}>
                <ScrollTextIcon size={14} /> {t('deviceAdmission.viewRunStatus')}
              </Button>
            ) : undefined
          }
          description={
            <span className="flex flex-col gap-2">
              {action === 'repair' ? <span>{t('deviceAdmission.repairDesc')}</span> : null}
              {/* Exactly one repair candidate renders as the single explicit
                  "Repair binding to <device>" affordance — never a disguised
                  multi-select. */}
              {action === 'repair' && showRetry ? (
                <span className="flex flex-wrap gap-2">
                  {repairTargets.map((target) => (
                    <Button
                      disabled={!topicId}
                      key={target.deviceId}
                      loading={repairingDeviceId === target.deviceId}
                      size="sm"
                      variant="secondary"
                      onClick={() => void handleRepair(target.deviceId)}
                    >
                      <MonitorCheckIcon size={14} />
                      {t('deviceAdmission.repairTo', { device: target.label })}
                    </Button>
                  ))}
                </span>
              ) : null}
              {runId ? <span>{t('deviceAdmission.operation', { id: runId })}</span> : null}
            </span>
          }
        />
        <DeviceConnectModal
          open={connectOpen}
          scope={scope}
          onClose={() => {
            setConnectOpen(false);
            void refreshDevices();
          }}
        />
      </>
    );
  },
);

DeviceAdmissionError.displayName = 'DeviceAdmissionError';

export default DeviceAdmissionError;
