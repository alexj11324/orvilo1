'use client';

import type { ReactNode } from 'react';

import RightPanel from '@/features/RightPanel';
import { usePermission } from '@/hooks/usePermission';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';

import PageCopilotConversationBody from '../Copilot/ConversationBody';
import { usePageAgentPanelControl } from '../RightPanel/OverrideContext';

/** Mount under existing PageAgentProvider(pageId=documentId), alongside the
 * native canvas/selection atom. The authoritative native lease verdict enters
 * here; this module never imports SDK PageEditorStore or the old lock hook. */
export function NativePageCopilotPanel({ lockedByOther }: { lockedByOther: boolean }) {
  const { allowed } = usePermission('edit_own_content');
  return (
    <NativePagePanelFrame enabled={allowed}>
      <PageCopilotConversationBody lockedByOther={lockedByOther} />
    </NativePagePanelFrame>
  );
}

/** Shared width/visibility owner for native Copilot and History. */
export function NativePagePanelFrame({
  children,
  enabled = true,
}: {
  children: ReactNode;
  enabled?: boolean;
}) {
  const { expand, toggle } = usePageAgentPanelControl();
  const width = useGlobalStore(systemStatusSelectors.pageAgentPanelWidth);
  const updateSystemStatus = useGlobalStore((s) => s.updateSystemStatus);
  return (
    <RightPanel
      defaultWidth={width}
      expand={expand && enabled}
      onExpandChange={toggle}
      onSizeChange={(size) => {
        if (!size?.width) return;
        const next = typeof size.width === 'string' ? Number.parseInt(size.width, 10) : size.width;
        if (Number.isFinite(next) && next > 0) updateSystemStatus({ pageAgentPanelWidth: next });
      }}
    >
      <div className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </RightPanel>
  );
}
