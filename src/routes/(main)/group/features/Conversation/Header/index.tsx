'use client';

import { cssVar } from 'antd-style';
import { memo, Suspense } from 'react';

import { AgentMigrationBadge } from '@/features/AgentTransferMigration';
import NavHeader from '@/features/NavHeader';
import WideScreenButton from '@/features/WideScreenContainer/WideScreenButton';
import { useAgentGroupStore } from '@/store/agentGroup';

import ShareButton from './ShareButton';

const Header = memo(() => {
  // Same source as `useGroupContext` — the resolved group, not the route-synced
  // chat-store global, which is transiently empty on navigation.
  const groupId = useAgentGroupStore((s) => s.activeGroupId);

  return (
    <NavHeader
      right={
        <div
          className="flex items-center gap-2"
          style={{ backgroundColor: cssVar.colorBgContainer }}
        >
          {/* Progress chip for a heavy group transfer/copy still filling in its
              conversations; renders nothing once the backfill finishes. */}
          {groupId && <AgentMigrationBadge groupId={groupId} />}
          <WideScreenButton />
          <Suspense>
            <ShareButton />
          </Suspense>
        </div>
      }
    />
  );
});

export default Header;
