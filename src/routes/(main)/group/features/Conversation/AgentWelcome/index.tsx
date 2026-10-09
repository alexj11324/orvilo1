'use client';

import { Markdown } from '@lobehub/ui';
import isEqual from 'fast-deep-equal';
import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { useConversationStore } from '@/features/Conversation';
import ToolAuthAlert from '@/features/Conversation/AgentWelcome/ToolAuthAlert';
import { contextSelectors } from '@/features/Conversation/store';
import SupervisorAvatar from '@/routes/(main)/group/features/GroupAvatar';
import { useAgentStore } from '@/store/agent';
import { agentSelectors, builtinAgentSelectors } from '@/store/agent/selectors';
import { agentGroupSelectors, useAgentGroupStore } from '@/store/agentGroup';
import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/selectors';

const InboxWelcome = memo(() => {
  const { t } = useTranslation(['welcome', 'chat']);
  const isInbox = useAgentStore(builtinAgentSelectors.isInboxAgent);
  const fontSize = useUserStore(userGeneralSettingsSelectors.fontSize);
  const meta = useAgentStore(agentSelectors.currentAgentMeta, isEqual);
  const groupId = useConversationStore(contextSelectors.groupId);
  const [groupMeta] = useAgentGroupStore((s) => [
    agentGroupSelectors.getGroupMeta(groupId ?? '')(s),
  ]);

  const agentSystemRoleMsg = t('agentDefaultMessageWithSystemRole', {
    name: meta.title || t('defaultAgent', { ns: 'chat' }),
    ns: 'chat',
  });

  const displayTitle = groupMeta.title;

  return (
    <>
      <div className="flex flex-col flex-1" />
      <div
        className="flex flex-col gap-3"
        style={{
          width: '100%',

          paddingBottom: 'max(10vh, 32px)',
        }}
      >
        <SupervisorAvatar size={78} />
        <div className="text-[32px] font-bold">{displayTitle}</div>
        <div className="flex flex-col" style={{ width: 'min(100%, 640px)' }}>
          <Markdown fontSize={fontSize} variant={'chat'}>
            {isInbox
              ? t('guide.defaultMessageWithoutCreate', { appName: 'Orvilo AI' })
              : agentSystemRoleMsg}
          </Markdown>
        </div>
        <ToolAuthAlert />
      </div>
    </>
  );
});

export default InboxWelcome;
