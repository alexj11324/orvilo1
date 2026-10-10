'use client';

import { DraggablePanel } from '@lobehub/ui/base-ui';
import { cssVar, useResponsive } from 'antd-style';
import { cn } from 'cn';
import { PanelRightOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router';

import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

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
  const { lg = true } = useResponsive();
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
        <div
          {...clickableProps()}
          title={t('acceptance.ledger.expand')}
          className={cn(
            `flex flex-col items-center gap-1.5 ${'cursor-pointer absolute z-10 inset-bs-4 end-3 min-w-8 py-2 px-2 border border-solid border-divider rounded-full bg-card hover:border-border hover:bg-fill-quaternary'}`,
            CLICKABLE_FOCUS_RING,
          )}
          onClick={() => onExpandChange(true)}
        >
          <PanelRightOpen size={14} />
          <div className={cn('text-xs font-medium leading-5 text-muted-foreground')}>
            {data.rounds.length}
          </div>
        </div>
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
          backgroundColor={cssVar.colorBgLayout}
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
