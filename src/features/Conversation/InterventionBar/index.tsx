import { classifyToolInterventionPresentation } from '@orvilo/types';
import { MoreHorizontalIcon } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Confirmation, ConfirmationRequest } from '@/components/ai-elements/confirmation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { useConversationResourceAccess } from '../hooks/useConversationResourceAccess';
import { useConversationStore } from '../store';
import {
  canApproveInterventionBatch,
  getInterventionBatch,
  type PendingIntervention,
} from '../store/slices/data/pendingInterventions';
import InterventionContent from './InterventionContent';
import InterventionTabBar from './InterventionTabBar';

interface InterventionBarProps {
  interventions: PendingIntervention[];
  onReviewInline?: (toolCallId: string) => void;
}

const InterventionBar = memo<InterventionBarProps>(({ interventions, onReviewInline }) => {
  const { t } = useTranslation(['chat', 'common']);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [actionsPortalTarget, setActionsPortalTarget] = useState<HTMLDivElement | null>(null);
  const [approveAllLoading, setApproveAllLoading] = useState(false);

  const approveAllToolCalls = useConversationStore((s) => s.approveAllToolCalls);
  // Workspace topics are shared: a view-only member can be looking at a
  // teammate's run and must not drive its approvals — same gate the per-card
  // actions apply.
  const { canUseResource } = useConversationResourceAccess();

  // Derive the active index from the stored toolCallId.
  // Falls back to the first intervention when the previously active one is resolved.
  const activeIndex = useMemo(() => {
    if (activeId) {
      const idx = interventions.findIndex((i) => i.toolCallId === activeId);
      if (idx >= 0) return idx;
    }
    return 0;
  }, [interventions, activeId]);

  const handleTabChange = useCallback(
    (index: number) => {
      setActiveId(interventions[index]?.toolCallId ?? null);
    },
    [interventions],
  );

  const activeIntervention = interventions[activeIndex];

  // The active card's own parallel batch. `interventions` spans the whole
  // conversation, so approve-all must never act on the raw list.
  const batch = useMemo(
    () => getInterventionBatch(interventions, activeIntervention),
    [interventions, activeIntervention],
  );

  const handleApproveAll = useCallback(async () => {
    if (approveAllLoading) return;
    setApproveAllLoading(true);
    try {
      await approveAllToolCalls(batch.map((i) => i.toolMessageId));
    } finally {
      setApproveAllLoading(false);
    }
  }, [approveAllLoading, approveAllToolCalls, batch]);

  if (!activeIntervention) return null;

  // Tabs still list every pending call so nothing is hidden; only the batch
  // action is scoped to the active turn.
  const hasMultipleCards = interventions.length > 1;
  const canApproveBatch = canApproveInterventionBatch(batch);

  const isBinary =
    classifyToolInterventionPresentation(activeIntervention.identifier, activeIntervention.apiName)
      .surface === 'binary';
  if (isBinary && onReviewInline) {
    return (
      <div className="mb-2 flex min-w-0 items-center gap-1">
        <Button
          className="min-w-0 text-muted-foreground"
          size="sm"
          variant="ghost"
          onClick={() => onReviewInline(activeIntervention.toolCallId)}
        >
          <span className="truncate">
            {t('components.aiElements.tool.awaitingApproval')} · {activeIntervention.apiName}
          </span>
        </Button>
        {(hasMultipleCards || canApproveBatch) && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button aria-label={t('more', { ns: 'common' })} size="icon-sm" variant="ghost" />
              }
            >
              <MoreHorizontalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {hasMultipleCards &&
                interventions.map((item, index) => (
                  <DropdownMenuItem
                    key={item.toolCallId}
                    onClick={() => {
                      handleTabChange(index);
                      onReviewInline(item.toolCallId);
                    }}
                  >
                    {index + 1}. {item.apiName}
                  </DropdownMenuItem>
                ))}
              {canUseResource && canApproveBatch && (
                <DropdownMenuItem disabled={approveAllLoading} onClick={handleApproveAll}>
                  {t('tool.intervention.approveAll', { count: batch.length })}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    );
  }
  const content = (
    <>
      {hasMultipleCards && (
        <InterventionTabBar
          activeIndex={activeIndex}
          interventions={interventions}
          approveAll={
            canUseResource && canApproveBatch
              ? { count: batch.length, loading: approveAllLoading, onApprove: handleApproveAll }
              : undefined
          }
          onTabChange={handleTabChange}
        />
      )}
      <InterventionContent
        actionsPortalTarget={isBinary ? null : actionsPortalTarget}
        intervention={activeIntervention}
        key={activeIntervention.toolCallId}
      />
      {!isBinary && (
        <div className="border-t border-border pt-3 empty:hidden" ref={setActionsPortalTarget} />
      )}
    </>
  );

  // Binary cards own their upstream Confirmation composition, also when shown
  // in global notifications. Custom questions keep the existing portal host.
  return isBinary ? (
    <div data-pending-hotkey-scope className="mb-3">
      {content}
    </div>
  ) : (
    <Confirmation
      data-pending-hotkey-scope
      approval={{ id: activeIntervention.toolCallId }}
      className="mb-3 gap-3 overflow-hidden p-4"
      data-intervention-placement="bottom"
      state="approval-requested"
    >
      <ConfirmationRequest>
        <div className="max-h-[50vh] min-h-0 overflow-y-auto">{content}</div>
      </ConfirmationRequest>
    </Confirmation>
  );
});

export default InterventionBar;
