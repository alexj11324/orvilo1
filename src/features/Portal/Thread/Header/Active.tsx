import { Avatar, Tag, Text } from '@lobehub/ui/base-ui';
import { resolveCCSubagentType } from '@orvilo/builtin-tool-claude-code/client';
import { cssVar } from 'antd-style';
import isEqual from 'fast-deep-equal';
import { memo } from 'react';

import BubblesLoading from '@/components/BubblesLoading';
import { LOADING_FLAT } from '@/const/message';
import { useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';
import { useChatStore } from '@/store/chat';
import { portalThreadSelectors } from '@/store/chat/selectors';
import { oneLineEllipsis } from '@/styles';

const Active = memo(() => {
  const currentThread = useChatStore(portalThreadSelectors.portalCurrentThread, isEqual);
  const agentMeta = useAgentStore(agentSelectors.getAgentMetaById(currentThread?.agentId || ''));

  if (!currentThread) return null;

  // Subagent spawn → show the specific template (e.g. "Explore",
  // "General purpose") as a chip next to the title. Sidebar only marks
  // "Subagent" generically; the header is where the detail belongs.
  const subagentTypeInfo = resolveCCSubagentType(currentThread.metadata?.subagentType);

  return (
    <div className="flex flex-row items-center gap-2" style={{ marginInlineStart: 4 }}>
      <Avatar {...agentMeta} size={24} />
      <Text
        className={oneLineEllipsis}
        ellipsis={true}
        style={{ color: cssVar.colorTextSecondary, fontSize: 14 }}
      >
        {currentThread.title === LOADING_FLAT ? (
          <div className="flex flex-col flex-1 h-[30px] justify-center">
            <BubblesLoading />
          </div>
        ) : (
          currentThread.title
        )}
      </Text>
      {subagentTypeInfo && (
        <Tag
          size={'small'}
          icon={
            <span className="anticon" role="img">
              <subagentTypeInfo.icon
                fill={'transparent'}
                height={'1em'}
                size={'1em'}
                width={'1em'}
              />
            </span>
          }
          style={{
            color: cssVar.colorTextDescription,
            flexShrink: 0,
            fontSize: 11,
          }}
        >
          {subagentTypeInfo.label}
        </Tag>
      )}
    </div>
  );
});

export default Active;
