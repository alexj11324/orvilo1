import isEqual from 'fast-deep-equal';
import { ChevronDown } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { PromptInputButton, PromptInputSubmit } from '@/components/ai-elements/prompt-input';
import { usePermission } from '@/hooks/usePermission';

import ActionDropdown from '../ActionBar/components/ActionDropdown';
import { useChatInputResourceAccess } from '../hooks/useChatInputResourceAccess';
import { SimpleTooltip } from '../SimpleTooltip';
import { selectors, useChatInputStore } from '../store';

const SendButton = memo(() => {
  const { t } = useTranslation('setting');
  const sendMenu = useChatInputStore((s) => s.sendMenu);
  const { generating, disabled } = useChatInputStore(selectors.sendButtonProps, isEqual);
  const [send, handleStop] = useChatInputStore((s) => [s.handleSendButton, s.handleStop]);

  // Workspace viewer doesn't have `message:create` → backend would 403.
  // OR the permission gate into the existing disabled prop so the button
  // visibly grays out and a tooltip explains why.
  const { allowed: canCreate, reason } = usePermission('create_content');

  // Per-resource General-access gating: a member with view-only access on the
  // bound agent/group can read the conversation but the server rejects sends.
  const { canUseResource, isAccessLoading } = useChatInputResourceAccess();
  const viewOnly = !canUseResource;
  const canSend = canCreate && !viewOnly && !isAccessLoading;

  const button = (
    <div className="flex items-center gap-1">
      <PromptInputSubmit
        aria-label={t(generating ? 'input.stop' : 'input.send', { ns: 'chat' })}
        disabled={!canSend || (!generating && disabled)}
        status={generating ? 'streaming' : 'ready'}
        type="button"
        onClick={() => {
          if (canSend && !generating) send();
        }}
        onStop={() => {
          if (canSend) handleStop();
        }}
      />
      {!generating && canSend && sendMenu && (
        <ActionDropdown menu={sendMenu} placement="topRight" trigger="click">
          <PromptInputButton aria-label={t('more', { ns: 'common' })}>
            <ChevronDown className="size-4" />
          </PromptInputButton>
        </ActionDropdown>
      )}
    </div>
  );

  if (!canCreate) return <SimpleTooltip title={reason}>{button}</SimpleTooltip>;
  if (viewOnly)
    return <SimpleTooltip title={t('permission.viewOnlySendTip')}>{button}</SimpleTooltip>;
  return button;
});

SendButton.displayName = 'SendButton';

export default SendButton;
