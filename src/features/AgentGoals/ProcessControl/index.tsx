'use client';

import { experimentOwner } from '@orvilo/utils/goalGraph';
import { memo, type ReactNode, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/reui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { usePermission } from '@/hooks/usePermission';
import { goalService } from '@/services/goal';
import { useChatStore } from '@/store/chat';
import { chatPortalSelectors } from '@/store/chat/selectors';
import { goalSelectors, useGoalStore } from '@/store/goal';

import { isExperiment } from '../Experiments/model';
import GoalAcceptanceCriteria from '../GoalAcceptanceCriteria';
import Activity from './Activity';
import Deliverables from './Deliverables';
import Findings from './Findings';
import Frontier, { type FrontierActions } from './Frontier';
import { buildGoalGraphView, opensOnResultSurface } from './goalGraphViewModel';
import Graph from './Graph';

/**
 * The process-control band of the goal detail page: what can move now
 * (frontier), the map of how the goal got here, what it believes, and what it
 * has been doing. Renders only for goals that actually carry a Goal Graph —
 * a plain task-carried goal has no nodes and keeps the page it always had.
 */

const styles = {
  section: 'py-2',
};

interface ProcessControlProps {
  /** The `goals` row id — not the carrier task's identifier. */
  goalId: string;
  /** Owned by the page so it can swap its portal panel for the overlay's. */
  graphFullscreen: boolean;
  onGraphFullscreenChange: (fullscreen: boolean) => void;
}

const ProcessControl = memo<ProcessControlProps>(
  ({ goalId, graphFullscreen, onGraphFullscreenChange }) => {
    const { t } = useTranslation('chat');
    const { allowed: canEdit } = usePermission('create_content');
    const [lastSelectedId, setSelectedId] = useState<string>();
    const nodePortal = useChatStore(chatPortalSelectors.goalNodeView);
    const selectedId = nodePortal?.goalId === goalId ? nodePortal.nodeId : lastSelectedId;

    const useFetchGoalGraph = useGoalStore((s) => s.useFetchGoalGraph);
    const decideGoal = useGoalStore((s) => s.decideGoal);
    const refreshGoalGraph = useGoalStore((s) => s.refreshGoalGraph);
    const openTaskResult = useChatStore((s) => s.openTaskResult);
    const openTaskDetail = useChatStore((s) => s.openTaskDetail);
    const openGoalNode = useChatStore((s) => s.openGoalNode);
    useFetchGoalGraph(goalId);
    const snapshot = useGoalStore(goalSelectors.goalGraph(goalId));

    const graph = useMemo(() => (snapshot ? buildGoalGraphView(snapshot) : undefined), [snapshot]);

    const actions: FrontierActions = useMemo(
      () => ({
        addTask: async (title: string, description?: string) => {
          await goalService.addNode({ description, id: goalId, kind: 'task', title });
          await refreshGoalGraph(goalId);
        },
        decide: (decisionId, optionId, resolution) =>
          void decideGoal(goalId, { decisionId, optionId, resolution }),
      }),
      [decideGoal, goalId, refreshGoalGraph],
    );

    // Every click funnels here: keep the map highlight (spatial continuity) and
    // open the drill-down. A Task with a delivery to read, or a healthy run in
    // flight, lands on its result surface — the live run while it works, the
    // report once it settles. A Task waiting or in trouble opens the original
    // Task detail, where configuration and failure context live.
    const select = useCallback(
      (nodeId: string) => {
        setSelectedId(nodeId);
        const view = graph?.byId[nodeId];
        const taskId = view?.node.taskId;
        if (!taskId || (graph && view && isExperiment(graph, view))) {
          openGoalNode(goalId, nodeId);
          return;
        }
        if (
          graph &&
          experimentOwner(
            { nodes: graph.nodes.map((item) => item.node), edges: graph.edges },
            nodeId,
          )
        )
          openTaskDetail(taskId);
        else if (view && opensOnResultSurface(view)) openTaskResult(taskId);
        else openTaskDetail(taskId);
      },
      [goalId, graph, openGoalNode, openTaskDetail, openTaskResult],
    );

    // Task-carried goals share the `goals` table but never grow a graph. Nothing
    // to control here, so the page keeps its original shape.
    if (!graph || graph.nodes.length === 0) return null;

    // The coordinator is decomposing the problem into tasks. `running` with zero
    // Task counts too: the decomposition claim flips the status before the
    // planner returns, and a re-plan after all Tasks were removed is the same
    // state. The surfaces below promise the incoming structure instead of
    // reading as an empty goal — the graph poll fills them in as nodes land.
    const planning =
      ['planning', 'running'].includes(graph.goal.status) &&
      !graph.nodes.some((view) => view.node.kind === 'task');
    // Presence of the acceptance block (not a non-empty list) keeps the section
    // mounted: removing the last criterion must leave the add control reachable,
    // while legacy prose-only goals (no acceptance config at all) show nothing.
    const acceptanceConfig = graph.goal.config?.acceptance;
    const criteriaIds = acceptanceConfig?.criteriaIds ?? [];
    // A closed goal cannot move: the coordinator returns immediately for these,
    // and a Task added here would sit `proposed` forever. Stop offering actions
    // that cannot land. The goal otherwise advances entirely on its own — the
    // only legitimate human control over its pace is pause/resume.
    const closed = ['achieved', 'canceled', 'failed'].includes(graph.goal.status);
    const canAct = canEdit && !closed;
    const hasExperiments = graph.nodes.some((view) => view.node.kind === 'experiment');

    const map = (
      <Graph
        fullscreen={graphFullscreen}
        graph={graph}
        key={goalId}
        planning={planning}
        selectedId={selectedId}
        onFullscreenChange={onGraphFullscreenChange}
        onSelect={select}
      />
    );

    return (
      <div className="flex flex-col gap-5">
        {hasExperiments && map}
        <div className="flex flex-col gap-3">
          <Frontier
            actions={actions}
            canEdit={canAct}
            graph={graph}
            planning={planning}
            onSelect={select}
          />
        </div>

        {!hasExperiments && map}

        <Accordion multiple defaultValue={['deliverables', 'findings', 'activity']}>
          {(
            [
              // The structured acceptance standard the terminal goal acceptance is
              // gated on. Collapsed by default — reference material, like the task
              // detail's 交付验收 section. Prose-only legacy goals have none.
              !!acceptanceConfig && {
                children: (
                  <div className={`flex flex-col ${styles.section}`}>
                    <GoalAcceptanceCriteria criteriaIds={criteriaIds} goalId={goalId} />
                  </div>
                ),
                key: 'acceptance',
                title: (
                  <div className="flex items-center gap-2">
                    <div className="text-[14px] font-semibold">{t('goalAcceptance.title')}</div>
                    {criteriaIds.length > 0 && (
                      <Badge size="sm" variant="secondary">
                        {criteriaIds.length}
                      </Badge>
                    )}
                    <div className="text-[12px] text-muted-foreground">
                      {t('goalAcceptance.gateHint')}
                    </div>
                  </div>
                ),
              },
              // Between the standard and the conclusions on purpose: 验收标准 says
              // what counts as done, 交付物 what was produced, 结论 what the goal now
              // believes about it. Findings routinely cite these artifacts.
              {
                children: (
                  <div className={`flex flex-col ${styles.section}`}>
                    <Deliverables graph={graph} />
                  </div>
                ),
                key: 'deliverables',
                title: (
                  <div className="flex items-center gap-2">
                    <div className="text-[14px] font-semibold">
                      {t('goalProcess.deliverables.title')}
                    </div>
                    {graph.artifacts.length > 0 && (
                      <Badge size="sm" variant="secondary">
                        {graph.artifacts.length}
                      </Badge>
                    )}
                  </div>
                ),
              },
              {
                children: (
                  <div className={`flex flex-col ${styles.section}`}>
                    <Findings graph={graph} onSelect={select} />
                  </div>
                ),
                key: 'findings',
                title: (
                  <div className="flex items-center gap-2">
                    <div className="text-[14px] font-semibold">
                      {t('goalProcess.findings.title')}
                    </div>
                    {graph.findings.length > 0 && (
                      <Badge size="sm" variant="secondary">
                        {graph.findings.length}
                      </Badge>
                    )}
                  </div>
                ),
              },
              {
                children: (
                  <div className={`flex flex-col ${styles.section}`}>
                    <Activity graph={graph} onSelect={select} />
                  </div>
                ),
                key: 'activity',
                title: (
                  <div className="flex items-center gap-2">
                    <div className="text-[14px] font-semibold">
                      {t('goalProcess.activity.title')}
                    </div>
                  </div>
                ),
              },
            ] as { children: ReactNode; key: string; title: ReactNode }[]
          ).map((item) => (
            <AccordionItem key={item.key} value={item.key}>
              <AccordionTrigger>{item.title}</AccordionTrigger>
              <AccordionContent>{item.children}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    );
  },
);

ProcessControl.displayName = 'GoalProcessControl';

export default ProcessControl;
