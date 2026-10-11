'use client';

import { useResponsive } from 'antd-style';
import { useState } from 'react';
import { useLocation } from 'react-router';

import { useAcceptanceScope } from './AcceptanceScope';
import AcceptanceCheckInventory from './Checks/AcceptanceCheckInventory';
import AcceptanceCheckOwnerToolbar from './Checks/AcceptanceCheckOwnerToolbar';
import AcceptanceDiscussion from './Comments/AcceptanceDiscussion';
import { commentIdFromHash } from './Comments/anchor';
import { messageThreads } from './Comments/discussionTimeline';
import { useAcceptanceComments } from './Comments/hooks';
import ReviewerApprovalBar from './Comments/ReviewerApprovalBar';
import AcceptanceOriginTopic from './Conversation/AcceptanceOriginTopic';
import AcceptanceResources from './Evidence/AcceptanceResources';
import { AcceptanceFlow } from './Flow/AcceptanceFlow';
import { getFlowNodeCount, resolveAcceptanceTab } from './Flow/flowNavigation';
import AcceptanceGoal from './Header/AcceptanceGoal';
import AcceptanceGoalEdit from './Header/AcceptanceGoalEdit';
import AcceptanceIdentity from './Header/AcceptanceIdentity';
import AcceptanceStatusControl from './Header/AcceptanceStatusControl';
import type { AcceptanceTabKey } from './Header/AcceptanceTabs';
import AcceptanceTabs from './Header/AcceptanceTabs';
import { flowPlanPhase } from './Plan/planReview';
import AcceptanceDecision from './Review/AcceptanceDecision';
import { checksForTurn } from './turnChecks';
import { useAcceptanceBundle } from './useAcceptanceBundle';
import { useAcceptanceTurn } from './useAcceptanceTurn';

interface AcceptancePageProps {
  onDraftToComposer?: (text: string) => boolean;
}

/**
 * The record's own body: an identity band that ends in the full-width rule,
 * then whichever face of the delivery the tabs select. The rule is the band's;
 * the tabs draw no line of their own, so the two never double up.
 */
export const AcceptanceOverview = ({
  onDraftToComposer,
}: Pick<AcceptancePageProps, 'onDraftToComposer'>) => {
  const { md = false } = useResponsive();
  const { acceptanceId, embedded } = useAcceptanceScope();
  const { turn } = useAcceptanceTurn(embedded);
  const { data } = useAcceptanceBundle(acceptanceId);
  const { threads } = useAcceptanceComments(acceptanceId);
  const [requestedTab, setTab] = useState<AcceptanceTabKey>();
  // A link to one comment has to land on the tab that shows it. The reader can
  // still leave: their own tab choice, once made, outranks the fragment.
  const { hash } = useLocation();
  const flowCount = getFlowNodeCount(data?.flows);
  const tab = resolveAcceptanceTab(
    requestedTab ?? (!embedded && commentIdFromHash(hash) ? 'discussion' : undefined),
    flowCount,
    Boolean(flowPlanPhase(data?.rounds.at(-1))),
    md,
  );
  const checks = data ? checksForTurn(data, turn) : [];
  const resourceCount = new Set(
    checks.flatMap((check) =>
      (check.evidence ?? [])
        .filter((evidence) => evidence.fileUrl || evidence.documentId)
        .map((evidence) => evidence.fileId ?? evidence.documentId ?? evidence.id),
    ),
  ).size;

  return (
    <>
      <div className="flex flex-col flex-none pbs-5 pbe-0 border-be border-solid border-divider">
        <div className="flex flex-col gap-3 w-full max-w-230 mx-auto px-6 [@media(width<=767px)]:px-4">
          <AcceptanceIdentity
            statusSlot={<AcceptanceStatusControl />}
            topicSlot={<AcceptanceOriginTopic />}
          />
          <AcceptanceGoal editSlot={<AcceptanceGoalEdit />} />
          {/* The requirement needs room to land before the tabs start a new
              thought — at the band's uniform gap it read as another row of
              the same list. */}
          <div className="flex flex-col pbs-4">
            <AcceptanceTabs
              active={tab}
              checkCount={checks.length}
              discussionCount={messageThreads(threads).length}
              flowCount={md ? flowCount : 0}
              resourceCount={resourceCount}
              onChange={setTab}
            />
          </div>
        </div>
      </div>

      <div
        className="flex flex-col gap-4 w-full max-w-230 mx-auto px-6 [@media(width<=767px)]:px-4 py-5"
        style={{ ...(tab === 'flow' ? { maxWidth: 1500 } : undefined) }}
      >
        {/* Deciding belongs where the evidence is. The discussion is a
            conversation; ending one there put the closing act under a thread
            that says nothing about whether the checks passed. Both faces of
            the act move together — the owner's decision bar and the
            reviewer's "fine by me" — or a reviewer would lose the affordance
            entirely. */}
        {tab === 'discussion' ? (
          <AcceptanceDiscussion />
        ) : tab === 'flow' ? (
          <>
            <AcceptanceFlow />
            <AcceptanceDecision onDraftToComposer={onDraftToComposer} />
          </>
        ) : tab === 'checks' ? (
          <>
            <AcceptanceCheckInventory toolbar={<AcceptanceCheckOwnerToolbar />} />
            <ReviewerApprovalBar />
            <AcceptanceDecision onDraftToComposer={onDraftToComposer} />
          </>
        ) : (
          <AcceptanceResources />
        )}
      </div>
    </>
  );
};
