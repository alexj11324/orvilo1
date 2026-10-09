import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import urlJoin from 'url-join';

import { ProviderIcon } from '@/components/OrviloIcons';
import { Button } from '@/components/ui/button';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useProviderName } from '@/hooks/useProviderName';
import { type GlobalLLMProviderKey } from '@/types/user/settings/modelProvider';

import { useConversationStore } from '../store';
import BaseErrorForm from './BaseErrorForm';

interface ChatInvalidAPIKeyProps {
  id: string;
  provider?: string;
}
const ChatInvalidAPIKey = memo<ChatInvalidAPIKeyProps>(({ id, provider }) => {
  const { t } = useTranslation(['modelProvider', 'error']);
  const navigate = useWorkspaceAwareNavigate();
  const [deleteMessage] = useConversationStore((s) => [s.deleteMessage]);
  const providerName = useProviderName(provider as GlobalLLMProviderKey);

  return (
    <BaseErrorForm
      avatar={<ProviderIcon provider={provider} shape={'square'} size={40} />}
      title={t(`unlock.credentialsUnavailable.title`, { name: providerName, ns: 'error' })}
      action={
        <Button
          type="button"
          variant="default"
          onClick={() => {
            navigate(urlJoin('/settings/provider', provider || 'all'));
            deleteMessage(id);
          }}
        >
          {t('unlock.goToSettings', { ns: 'error' })}
        </Button>
      }
      desc={t(`unlock.credentialsUnavailable.description`, {
        name: providerName,
        ns: 'error',
      })}
    />
  );
});

export default ChatInvalidAPIKey;
