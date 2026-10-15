'use client';

import { PanelRightOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router';

import { DraggablePanel } from '@/components/DraggablePanel';
import { Button } from '@/components/ui/button';
import { useIsLargeViewport } from '@/hooks/useIsMobile';

import { AcceptanceDrawer } from '../../AcceptanceDrawer';
import ReportViewer from '../../Report/ReportViewer';
import { resolveRoundParam } from '../../utils';
import { useAcceptanceScope } from '../AcceptanceScope';
import { checkFilterState } from '../Checks/checkState';
import { originTopicPanelProps } from '../Conversation/originConversation';
import { useAcceptanceBundle } from '../useAcceptanceBundle';
import { canViewAcceptanceHistory } from '../visibility';
import LedgerPanel, { type AcceptanceRound } from './LedgerPanel';
import { useAcceptanceRailState } from './useAcceptanceRailState';

const AcceptanceLedgerRail = () => {
  const { t } = useTranslation('verify');
  const lg = useIsLargeViewport();
  const isNarrowViewport = !lg;
  const params = useParams<{ checkId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { acceptanceId, embedded } = useAcceptanceScope();
  const { data } = useAcceptanceBundle(acceptanceId);
  const focused = Boolean(params.checkId);
  const { expand, onExpandChange, originConversation } = useAcceptanceRailState({
    focused,
    isNarrowViewport,
  });
  const originTopicOpen = Boolean(originConversation?.isOpen);
  const highlightRound = null;

  if (!data || !canViewAcceptanceHistory(data.isOwner)) return null;

  const urlRoundRaw = searchParams.get('report');
  const reportRound = embedded ? null : resolveRoundParam(data.rounds, urlRoundRaw);
  const reviewableChecks = data.checks;
  const reviewByRound = (() => {
    const map = new Map<number, { accepted: number; total: number }>();
    for (const check of reviewableChecks) {
      const round = check.resultRound;
      if (round === undefined || round === null) continue;
      const cur = map.get(round) ?? { accepted: 0, total: 0 };
      cur.total += 1;
      if (checkFilterState(check) === 'accepted') cur.accepted += 1;
      map.set(round, cur);
    }
    return map;
  })();

  const openReport = (round: AcceptanceRound | null) => {
    if (embedded) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (round?.run.roundIndex == null) next.delete('report');
        else next.set('report', String(round.run.roundIndex));
        return next;
      },
      { replace: true },
    );
  };

  const TopicPanel = originConversation?.TopicPanel;
  const topicProps = originTopicPanelProps({
    isOpen: originTopicOpen,
    origin: data.origin,
    subjectTitle: data.subject.title,
  });
  const topic =
    topicProps && TopicPanel ? (
      <TopicPanel
        agentAvatar={topicProps.agentAvatar}
        agentBackgroundColor={topicProps.agentBackgroundColor}
        agentId={topicProps.agentId}
        title={topicProps.title}
        topicId={topicProps.topicId}
        onCollapse={() => onExpandChange(false)}
      />
    ) : null;

  const ledger = (
    <LedgerPanel
      hideCollapse={isNarrowViewport}
      highlight={highlightRound}
      reviewByRound={reviewByRound}
      rounds={data.rounds}
      onCollapse={() => onExpandChange(false)}
      onOpenReport={openReport}
    />
  );

  return (
    <>
      {!focused && !expand && (
        <Button
          aria-label={`${t('acceptance.ledger.expand')} (${data.rounds.length})`}
          className="absolute z-10 inset-bs-4 end-3 w-8 rounded-full border-divider bg-card p-0 hover:border-border hover:bg-fill-quaternary coarse:before:absolute coarse:before:-inset-1.5 coarse:before:content-['']"
          size="compact"
          title={t('acceptance.ledger.expand')}
          type="button"
          variant="outline"
          onClick={() => onExpandChange(true)}
        >
          <PanelRightOpen className="size-4" size={16} />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -inset-bs-1 -end-1 min-w-5 rounded-(--radius-chip) bg-card px-1 text-xs font-medium leading-5 text-muted-foreground"
          >
            {data.rounds.length}
          </span>
        </Button>
      )}
      {isNarrowViewport ? (
        <AcceptanceDrawer
          noHeader
          containerMaxWidth={'100%'}
          open={expand}
          placement={'right'}
          styles={{ bodyContent: { padding: 0 } }}
          title={t('acceptance.ledger.title')}
          width={'min(340px, 88vw)'}
          onClose={() => onExpandChange(false)}
        >
          {topic ?? ledger}
        </AcceptanceDrawer>
      ) : (
        <DraggablePanel
          backgroundColor={'var(--background)'}
          defaultSize={{ width: 340 }}
          expand={expand}
          minWidth={300}
          placement={'right'}
          style={{ flex: 'none', height: '100%' }}
          onExpandChange={onExpandChange}
        >
          <div className="flex flex-col h-full min-h-0 overflow-hidden">
            {topic ?? <div className="flex flex-col h-full overflow-auto">{ledger}</div>}
          </div>
        </DraggablePanel>
      )}
      <AcceptanceDrawer
        noHeader
        containerMaxWidth={'100%'}
        open={reportRound !== null}
        placement={'right'}
        title={t('report.titleFallback')}
        width={'min(960px, 92vw)'}
        styles={{
          bodyContent: { height: '100%', minHeight: 0, overflow: 'hidden', padding: 0 },
        }}
        onClose={() => openReport(null)}
      >
        {reportRound && (
          <div className="flex flex-col h-full relative">
            <ReportViewer runId={reportRound.run.id} />
          </div>
        )}
      </AcceptanceDrawer>
    </>
  );
};

export default AcceptanceLedgerRail;
