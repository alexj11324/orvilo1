import type { ChatMessageError } from '@orvilo/types';
import { LaptopIcon, PlugZapIcon, RotateCwIcon, ScrollTextIcon } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import ErrorAlert from '@/features/Conversation/components/ErrorAlert';
import {
  contextSelectors,
  dataSelectors,
  useConversationStore,
} from '@/features/Conversation/store';
import DeviceConnectModal from '@/features/DeviceManager/DeviceConnectModal';
import { useDeviceList } from '@/features/DeviceManager/useDeviceList';
import { useAgentManagementAccess } from '@/features/ResourcePermission/useAgentManagementAccess';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';

import type { DeviceAdmissionErrorBody } from './deviceAdmission';
import { resolveDeviceAdmissionAction } from './deviceAdmission';
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
const DeviceAdmissionError = memo<DeviceAdmissionErrorProps>(({ body, error, id, onRetry }) => {
  const { t } = useTranslation('chat');
  const navigate = useWorkspaceAwareNavigate();
  const agentId = useConversationStore(contextSelectors.agentId);
  const [updateMessageError, deleteMessage] = useConversationStore((s) => [
    s.updateMessageError,
    s.deleteMessage,
  ]);
  const messageContent = useConversationStore((s) =>
    id ? dataSelectors.getDisplayMessageById(id)(s)?.content : undefined,
  );
  const { disabled, loading, retryParentMessage } = useRetryParentMessage(id ?? '');

  const { mutate: refreshDevices } = useDeviceList();
  const { canManageAgent } = useAgentManagementAccess(agentId ?? '');
  const [connectOpen, setConnectOpen] = useState(false);

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
          action === 'repair' && canManageAgent && agentId ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => navigate(`/settings/agents/${agentId}`)}
            >
              {t('platformAgent.deviceGuard.configure')}
            </Button>
          ) : action === 'retry-inventory' ? (
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
            {runId ? <span>{t('deviceAdmission.operation', { id: runId })}</span> : null}
          </span>
        }
      />
      <DeviceConnectModal
        open={connectOpen}
        onClose={() => {
          setConnectOpen(false);
          void refreshDevices();
        }}
      />
    </>
  );
});

DeviceAdmissionError.displayName = 'DeviceAdmissionError';

export default DeviceAdmissionError;
