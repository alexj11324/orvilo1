import { Markdown } from '@lobehub/ui';
import type { GoalGraphSnapshot } from '@orvilo/types';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/reui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { useChatStore } from '@/store/chat';

import {
  type GoalGraphView,
  type GoalNodeView,
  hasReviewableResult,
} from '../ProcessControl/goalGraphViewModel';
import { experimentInputs, experimentRelations } from './model';

export const ExperimentDetail = ({
  graph,
  view,
  snapshot,
  children,
}: {
  graph: GoalGraphView;
  view: GoalNodeView;
  snapshot: GoalGraphSnapshot;
  children: ReactNode;
}) => {
  const { t } = useTranslation('chat');
  const openNode = useChatStore((s) => s.drillIntoGoalNode);
  const openTask = useChatStore((s) => s.openTaskDetail);
  const openResult = useChatStore((s) => s.openTaskResult);
  const openAcceptance = useChatStore((s) => s.openAcceptance);
  const relations = experimentRelations(graph, view.node.id);
  const inputs = experimentInputs(snapshot, view.node.id);
  return (
    <div className="flex flex-col flex-1" style={{ minHeight: 0 }}>
      <div className="flex flex-col gap-2.5 p-4" style={{ flexShrink: 0 }}>
        <div className="flex gap-2 flex-wrap">
          <Badge variant="secondary">{t('goalExperiment.number', { number: view.seq })}</Badge>
          <Badge variant="secondary">
            {t(
              view.isVerifying
                ? 'goalProcess.tag.verifying'
                : `goalProcess.nodeStatus.${view.node.status}`,
            )}
          </Badge>
        </div>
        <h2 className="text-[18px] font-semibold">{view.node.title}</h2>
        <div className="flex gap-2 flex-wrap">
          {view.node.taskId && (
            <Button size="sm" onClick={() => openTask(view.node.taskId!)}>
              {t('goalExperiment.execution')}
            </Button>
          )}
          {view.node.taskId && hasReviewableResult(view) && (
            <Button size="sm" onClick={() => openResult(view.node.taskId!)}>
              {t('goalExperiment.delivery')}
            </Button>
          )}
          {view.acceptance && (
            <Button size="sm" onClick={() => openAcceptance(view.acceptance!.id)}>
              {t('goalExperiment.acceptance')}
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-5 p-4" style={{ minHeight: 0, overflowY: 'auto' }}>
        <div className="flex flex-col gap-2" style={{ flexShrink: 0 }}>
          <div className="font-semibold">{t('goalExperiment.result')}</div>
          {view.findings.length === 0 && (
            <div className="text-muted-foreground">{t('goalExperiment.noResult')}</div>
          )}
          {view.findings.map((finding) => (
            <div className="flex flex-col gap-1.5" key={finding.id}>
              <div className="font-medium">{finding.title}</div>
              {finding.description && (
                <Markdown fontSize={13} style={{ flexShrink: 0 }} variant={'chat'}>
                  {finding.description}
                </Markdown>
              )}
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2" style={{ flexShrink: 0 }}>
          <div className="font-semibold">{t('goalExperiment.lineage')}</div>
          {relations.parents.length === 0 && (
            <div className="text-muted-foreground">{t('goalExperiment.baseline')}</div>
          )}
          {(['parents', 'children'] as const).map((kind) =>
            relations[kind].map((relative) => (
              <Button
                key={`${kind}:${relative.node.id}`}
                size="sm"
                style={{
                  height: 'auto',
                  minHeight: 32,
                  paddingBlock: 6,
                  whiteSpace: 'normal',
                  justifyContent: 'flex-start',
                  textAlign: 'start',
                }}
                onClick={() => openNode(graph.goal.id, relative.node.id)}
              >
                {t(kind === 'parents' ? 'goalExperiment.parentLink' : 'goalExperiment.childLink', {
                  number: relative.seq,
                  title: relative.node.title,
                })}
              </Button>
            )),
          )}
        </div>
        <Accordion defaultValue={['instruction']}>
          {[
            {
              children: (
                <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                  {view.node.description ?? view.node.title}
                </div>
              ),
              key: 'instruction',
              title: t('goalExperiment.instruction'),
            },
            {
              children: (
                <div className="flex flex-col gap-2">
                  <div className="text-[12px] text-muted-foreground">
                    {t('goalExperiment.inputHint')}
                  </div>
                  {inputs.map((input) => (
                    <div className="flex flex-col gap-1" key={input.workVersionId}>
                      <div>{input.work?.title ?? t('goalExperiment.unavailableInput')}</div>
                      <div
                        className="text-[12px] text-muted-foreground"
                        style={{ overflowWrap: 'anywhere' }}
                      >
                        {input.workVersionId}
                      </div>
                    </div>
                  ))}
                </div>
              ),
              key: 'inputs',
              title: t('goalExperiment.inputs', { count: inputs.length }),
            },
          ]
            .filter(Boolean)
            .map((item) => (
              <AccordionItem key={item.key} value={item.key}>
                <AccordionTrigger>{item.title}</AccordionTrigger>
                <AccordionContent>{item.children}</AccordionContent>
              </AccordionItem>
            ))}
        </Accordion>
        {children}
      </div>
    </div>
  );
};
