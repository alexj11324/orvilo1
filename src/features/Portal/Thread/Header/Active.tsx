import { resolveCCSubagentType } from '@orvilo/builtin-tool-claude-code/client';
import { cssVar } from 'antd-style';
import { cn } from 'cn';
import isEqual from 'fast-deep-equal';
import { memo } from 'react';

import BubblesLoading from '@/components/BubblesLoading';
import { Badge } from '@/components/reui/badge';
import { LOADING_FLAT } from '@/const/message';
import AssigneeAvatar from '@/features/AgentTasks/features/AssigneeAvatar';
import { useChatStore } from '@/store/chat';
import { portalThreadSelectors } from '@/store/chat/selectors';
import { oneLineEllipsis } from '@/styles';

const Active = memo(() => {
  const currentThread = useChatStore(portalThreadSelectors.portalCurrentThread, isEqual);

  if (!currentThread) return null;

  // Subagent spawn → show the specific template (e.g. "Explore",
  // "General purpose") as a chip next to the title. Sidebar only marks
  // "Subagent" generically; the header is where the detail belongs.
  const subagentTypeInfo = resolveCCSubagentType(currentThread.metadata?.subagentType);

  return (
    <div className="flex flex-row items-center gap-2" style={{ marginInlineStart: 4 }}>
      <AssigneeAvatar agentId={currentThread.agentId} size={24} />
      <div
        className={cn('truncate min-w-0', oneLineEllipsis)}
        style={{ color: cssVar.colorTextSecondary, fontSize: 14 }}
      >
        {currentThread.title === LOADING_FLAT ? (
          <div className="flex flex-col flex-1 h-[30px] justify-center">
            <BubblesLoading />
          </div>
        ) : (
          currentThread.title
        )}
      </div>
      {subagentTypeInfo && (
        <Badge
          size="sm"
          variant="secondary"
          style={{
            color: cssVar.colorTextDescription,
            flexShrink: 0,
            fontSize: 11,
          }}
        >
          <span className="anticon" role="img">
            <subagentTypeInfo.icon className={'anticon'} size={12} />
          </span>
          {subagentTypeInfo.label}
        </Badge>
      )}
    </div>
  );
});

export default Active;
