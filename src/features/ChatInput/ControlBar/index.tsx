import { Skeleton } from '@lobehub/ui/base-ui';
import { createStaticStyles, cx } from 'antd-style';
import { memo } from 'react';

import ChatInputCredits from '@/business/client/features/ChatInputCredits';
import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors } from '@/store/agent/selectors';

import ContextWindow from '../ActionBar/Token';
import { useAgentId } from '../hooks/useAgentId';
import { useChatInputResourceAccess } from '../hooks/useChatInputResourceAccess';
import { useEffectiveAgentMode } from '../hooks/useEffectiveAgentMode';
import { useChatInputStore } from '../store';
import ApprovalMode from './ApprovalMode';
import ModeSelector from './ModeSelector';
import WorkspaceControls from './WorkspaceControls';

const styles = createStaticStyles(({ css }) => ({
  // `flex: none` keeps the row at 28px inside the column-flex composer; without
  // it the bar shrinks to the compact chips' min-content height.
  bar: css`
    flex: none;
    height: 28px;
    padding-block: 0;
    padding-inline: 4px;
  `,
  // Left cluster (mode + device + working directory + git) is the variable-width
  // part. It shrinks first and, once its long labels have truncated as far as
  // they can, scrolls horizontally instead of wrapping each chip's text. The
  // scrollbar is hidden — trackpad / wheel still works.
  leftGroup: css`
    scrollbar-width: none;
    overflow: auto hidden;
    flex: 1;
    min-width: 0;

    &::-webkit-scrollbar {
      display: none;
    }
  `,
  // Right cluster (approval mode + context window) stays pinned and intact.
  rightGroup: css`
    flex: none;
  `,
}));

const ControlBar = memo(() => {
  const agentId = useAgentId();
  const { canShowControls } = useChatInputResourceAccess();
  const showContextWindow = useChatInputStore((s) =>
    s.rightActions.flat().includes('contextWindow'),
  );

  const isLoading = useAgentStore((s) => agentByIdSelectors.isAgentConfigLoadingById(agentId)(s));
  const { isAgentRuntimeMode, isPreferenceLoading } = useEffectiveAgentMode(agentId);

  if (!canShowControls || isPreferenceLoading) return null;

  // Skeleton placeholder to prevent layout jump during loading
  if (!agentId || isLoading) {
    return (
      <div className={cx('flex flex-row items-center gap-1', styles.bar)}>
        <Skeleton style={{ height: 22, minWidth: 64, width: 64 }} />
        <Skeleton style={{ height: 22, minWidth: 100, width: 100 }} />
      </div>
    );
  }

  return (
    <div className={cx('flex flex-row items-center justify-between', styles.bar)}>
      {/* Left: chat-mode switcher + (agent-only) execution device + working directory */}
      <div className={cx('flex flex-row items-center gap-1', styles.leftGroup)}>
        <ModeSelector />
        {isAgentRuntimeMode && <WorkspaceControls agentId={agentId} />}
      </div>

      <div className={cx('flex flex-row items-center gap-1', styles.rightGroup)}>
        <ChatInputCredits />
        {isAgentRuntimeMode && <ApprovalMode />}
        {showContextWindow && <ContextWindow />}
      </div>
    </div>
  );
});

ControlBar.displayName = 'ControlBar';

export default ControlBar;
