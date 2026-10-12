'use client';

import { cn } from 'cn';
import { memo } from 'react';

import AgentRuntimeIcon from '@/components/AgentRuntimeIcon';
import { AgentMigrationBadge, useAgentTransferJob } from '@/features/AgentTransferMigration';
import { useAgentContext } from '@/features/Conversation/useAgentContext';
import NavHeader from '@/features/NavHeader';
import OpenInAppButton from '@/features/OpenInAppButton';
import TopicCommentButton from '@/features/TopicComment/TopicCommentButton';
import { useEffectiveWorkingDirectory } from '@/hooks/useEffectiveWorkingDirectory';
import { useAgentStore } from '@/store/agent';
import { agentSelectors, chatConfigByIdSelectors } from '@/store/agent/selectors';
import { useElectronStore } from '@/store/electron';
import { resolveAgentRuntimeType } from '@/utils/agentRuntimeIdentity';

import FavoriteToggle from './FavoriteToggle';
import HeaderActions from './HeaderActions';
import ShareButton from './ShareButton';
import Tags from './Tags';
import TerminalPanelToggle from './TerminalPanelToggle';
import WorkingPanelToggle from './WorkingPanelToggle';

// Below this column width the header is a solid in-flow bar with a bottom
// border; at or above it, the header floats above the full-bleed message
// stream (Codex-style): the 960px reading column stays clear of the floating
// slots, which keep their own opaque backing for when content scrolls under.
const headerStyles = {
  container:
    'relative [container-name:agent-conv-header] [container-type:inline-size] border-be border-divider bg-card @min-[1200px]/agent-chat-layout:pointer-events-none @min-[1200px]/agent-chat-layout:absolute @min-[1200px]/agent-chat-layout:z-10 @min-[1200px]/agent-chat-layout:inset-bs-0 @min-[1200px]/agent-chat-layout:inset-x-0 @min-[1200px]/agent-chat-layout:border-be-0 @min-[1200px]/agent-chat-layout:bg-transparent',
  leftContent:
    'min-w-0 flex-auto overflow-hidden bg-card @min-[1200px]/agent-chat-layout:grow-0 @min-[1200px]/agent-chat-layout:rounded-(--radius-button)',
  rightContent: 'bg-card @min-[1200px]/agent-chat-layout:rounded-(--radius-button)',
  slotLeft:
    'min-w-0 flex-auto overflow-hidden @min-[1200px]/agent-chat-layout:pointer-events-auto @min-[1200px]/agent-chat-layout:overflow-visible @min-[1200px]/agent-chat-layout:grow-0 @min-[1200px]/agent-chat-layout:max-w-55',
  migrationChipInline: 'shrink-0 @min-[1200px]/agent-chat-layout:hidden',
  migrationChipOverlay:
    'pointer-events-none absolute z-11 inset-bs-0 inset-x-0 hidden h-11 items-center justify-center @min-[1200px]/agent-chat-layout:flex',
  slotRight: 'min-w-0 flex-none @min-[1200px]/agent-chat-layout:pointer-events-auto',
} as const;

const Header = memo(() => {
  const { agentId, topicId } = useAgentContext();
  // No home/desktop fallback: the IDE button should only show up once the user
  // explicitly picked a working directory (topic / agent / device default).
  const workingDirectory = useEffectiveWorkingDirectory(agentId || undefined, {
    homeFallback: false,
    topicId,
  });
  const splitView = useElectronStore((s) => s.splitView);
  const agentMeta = useAgentStore((s) =>
    agentId ? agentSelectors.getAgentMetaById(agentId)(s) : undefined,
  );
  const runtimeType = useAgentStore((s) =>
    resolveAgentRuntimeType(agentId ? s.agentMap[agentId] : undefined),
  );
  const isLocalSystemEnabled = useAgentStore((s) =>
    agentId ? chatConfigByIdSelectors.isLocalSystemEnabledById(agentId)(s) : false,
  );

  // History-backfill chip in the center slot; the hook shares one SWR key with
  // the rest of the migration UI, so this adds no extra polling.
  const { data: transferJob } = useAgentTransferJob({ agentId });

  return (
    <div className={headerStyles.container}>
      <NavHeader
        left={
          <div className={cn('flex items-center gap-1', headerStyles.leftContent)}>
            {splitView && agentMeta && (
              <span className="flex-none ms-2">
                <AgentRuntimeIcon size={24} type={runtimeType} />
              </span>
            )}
            <Tags />
            {/* Reference header order: title → favorite switch → chat options
                → toolbar. The toggle self-hides on the new-chat surface. */}
            <FavoriteToggle />
            <HeaderActions />
          </div>
        }
        right={
          <div className={cn('flex items-center gap-1', headerStyles.rightContent)}>
            {transferJob && agentId && (
              <div className={headerStyles.migrationChipInline}>
                <AgentMigrationBadge agentId={agentId} />
              </div>
            )}
            {isLocalSystemEnabled && workingDirectory && (
              <OpenInAppButton workingDirectory={workingDirectory} />
            )}
            <TerminalPanelToggle />
            <TopicCommentButton />
            <ShareButton />
            <WorkingPanelToggle />
          </div>
        }
        slotClassNames={{
          left: headerStyles.slotLeft,
          right: headerStyles.slotRight,
        }}
      />
      {transferJob && agentId && (
        <div className={headerStyles.migrationChipOverlay}>
          <AgentMigrationBadge agentId={agentId} />
        </div>
      )}
    </div>
  );
});

export default Header;
