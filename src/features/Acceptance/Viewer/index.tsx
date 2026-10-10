'use client';

import { useState } from 'react';
import { useParams } from 'react-router';

import { extractUuid } from '../utils';
import { AcceptanceOverview } from './AcceptanceOverview';
import { AcceptanceBundleGate, AcceptanceScope } from './AcceptanceScope';
import { FlowPanelHostContext } from './Flow/FlowPanelHost';
import AcceptanceLedgerRail from './History/AcceptanceLedgerRail';
import { acceptanceScrollLayout } from './layout';

const styles = {
  flowPanel:
    'flex-none w-[min(440px,42%)] h-full min-h-0 empty:hidden [@media(width<=767px)]:w-full [@media(width<=767px)]:h-1/2 [@media(width<=767px)]:border-t [@media(width<=767px)]:border-sidebar-border',
  page: 'relative overflow-hidden w-full h-full bg-card [@media(width<=767px)]:flex-col',
};
interface AcceptancePageProps {
  acceptanceId?: string;
  onDraftToComposer?: (text: string) => boolean;
}

/**
 * The acceptance reader.
 *
 * It is hosted by the portal (`Portal/Acceptance`), which mounts it against an
 * explicit `acceptanceId` — the acceptance a task panel is showing. The
 * standalone `/acceptance/:id` page and its `…/check/:checkId` second level
 * were retired with the standalone platform, so there is no non-embedded,
 * route-driven mount left: an acceptance is always read inside the object that
 * owns it, never as a page of its own.
 */
const AcceptancePage = ({
  acceptanceId: explicitAcceptanceId,
  onDraftToComposer,
}: AcceptancePageProps) => {
  const params = useParams<{ acceptanceId: string }>();
  const acceptanceId = explicitAcceptanceId ?? extractUuid(params.acceptanceId);
  const [flowPanelHost, setFlowPanelHostContext] = useState<HTMLDivElement | null>(null);

  if (!acceptanceId) return null;

  return (
    <AcceptanceScope embedded acceptanceId={acceptanceId}>
      <AcceptanceBundleGate>
        <FlowPanelHostContext value={flowPanelHost}>
          <div className={`flex ${styles.page}`}>
            <div
              className="flex flex-1"
              style={{ minHeight: 0, minWidth: 0, position: 'relative' }}
            >
              <div
                className="flex flex-col flex-1"
                style={{ minWidth: 0, overflow: acceptanceScrollLayout.frameOverflow }}
              >
                <div className="flex flex-col gap-4" style={{ width: '100%' }}>
                  <AcceptanceOverview onDraftToComposer={onDraftToComposer} />
                </div>
              </div>
              <AcceptanceLedgerRail />
            </div>
            <div className={styles.flowPanel} ref={setFlowPanelHostContext} />
          </div>
        </FlowPanelHostContext>
      </AcceptanceBundleGate>
    </AcceptanceScope>
  );
};

export default AcceptancePage;
