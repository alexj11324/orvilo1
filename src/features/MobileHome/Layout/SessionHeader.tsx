'use client';

import { ChatHeader } from '@lobehub/ui/mobile';
import { AGENT_CHAT_URL } from '@orvilo/const';
import { cx } from 'antd-style';
import { MessageSquarePlus } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import ActionIcon from '@/components/ActionIcon';
import { ProductLogo } from '@/components/Branding';
import { MOBILE_HEADER_ICON_SIZE } from '@/const/layoutTokens';
import { resolveInboxAgentRouteId } from '@/features/AgentRoute/useResolvedAgentRouteId';
import { useLastUsedAgentId } from '@/features/MobileHome/TopicListContent/useMobileTopics';
import UserAvatar from '@/features/User/UserAvatar';
import { useAgentStore } from '@/store/agent';
import { builtinAgentSelectors } from '@/store/agent/selectors';
import { mobileHeaderSticky } from '@/styles/mobileHeader';

import { styles } from './SessionHeader/style';

const Header = memo(() => {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const lastUsedAgentId = useLastUsedAgentId();
  const inboxAgentId = useAgentStore(builtinAgentSelectors.inboxAgentId);

  // "+" starts a new conversation on the last-used agent — never creates a new
  // agent. With no conversations yet it lands on Orvilo AI (the inbox agent).
  const openNewConversation = () => {
    const target = lastUsedAgentId ?? resolveInboxAgentRouteId(inboxAgentId);
    navigate(AGENT_CHAT_URL(target, true));
  };

  return (
    <ChatHeader
      style={mobileHeaderSticky}
      left={
        <div className={cx(styles.leftContainer, 'flex items-center gap-2')}>
          <UserAvatar size={32} onClick={() => navigate('/me')} />
          <ProductLogo type={'text'} />
        </div>
      }
      right={
        <ActionIcon
          aria-label={t('cmdk.newConversation')}
          icon={MessageSquarePlus}
          size={MOBILE_HEADER_ICON_SIZE}
          onClick={openNewConversation}
        />
      }
    />
  );
});

export default Header;
