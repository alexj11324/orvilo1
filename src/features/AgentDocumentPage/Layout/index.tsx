'use client';

import { Outlet } from 'react-router';

import { NavPanelPortal } from '@/features/NavPanel/NavPanelPortal';

import AgentDocumentSidebarContent from '../RightPanel';

const AgentDocumentLayout = () => (
  <>
    <NavPanelPortal navKey="agent-docs">
      <AgentDocumentSidebarContent />
    </NavPanelPortal>
    <div
      className="flex flex-1 h-full w-full"
      style={{ minHeight: 0, overflow: 'hidden', position: 'relative' }}
    >
      <div className="flex flex-col flex-1" style={{ minHeight: 0, minWidth: 0 }}>
        <Outlet />
      </div>
    </div>
  </>
);

export default AgentDocumentLayout;
