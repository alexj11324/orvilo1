import { type ChatToolPayloadWithResult } from '@orvilo/types';
import { AlertTriangle, Check, HandIcon, Maximize2, Minimize2, X } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
} from '@/components/ai-elements/chain-of-thought';
import { MessageAction } from '@/components/ai-elements/message';
import { Spinner } from '@/components/ui/spinner';
import { useAutoScroll } from '@/hooks/useAutoScroll';
import { useChatStore } from '@/store/chat';
import { operationSelectors } from '@/store/chat/slices/operation/selectors';

import { messageStateSelectors, useConversationStore } from '../../../store';
import {
  TIME_MS_PER_SECOND,
  WORKFLOW_EXPANDED_SCROLL_THRESHOLD_PX,
  WORKFLOW_HEADLINE_DEBOUNCE_MS,
  WORKFLOW_PROSE_IDLE_COMMIT_MS,
  WORKFLOW_PROSE_QUICK_COMMIT_MS,
  WORKFLOW_WORKING_ELAPSED_SHOW_AFTER_MS,
} from '../constants';
import {
  areWorkflowToolsComplete,
  formatReasoningDuration,
  getWorkflowCompletionStatus,
  getWorkflowStreamingHeadlineState,
  getWorkflowSummaryText,
  shapeProseForWorkflowHeadline,
} from '../toolDisplayNames';
import type { RenderableAssistantContentBlock } from './types';
import WorkflowExpandedList from './WorkflowExpandedList';

export type WorkflowExpandLevel = 'collapsed' | 'semi' | 'full';

/** Per-phase initial level. Pass an object when streaming and completion
 *  should differ — e.g. heterogeneous agents want full while streaming but
 *  still collapse once a turn finishes. A plain string applies to both. */
export type WorkflowExpandLevelDefault =
  WorkflowExpandLevel | { completion?: WorkflowExpandLevel; streaming?: WorkflowExpandLevel };

interface WorkflowCollapseProps {
  /** Assistant group message id (for generation state) */
  assistantMessageId: string;
  blocks: RenderableAssistantContentBlock[];
  /**
   * Fixed default expand level. When set, overrides the built-in auto
   * behavior (expand while streaming, collapse after completion) for the
   * initial state and resets. Users can still toggle locally.
   * Pass an object to override only one phase (e.g. `{ streaming: 'full' }`).
   * Undefined = legacy auto behavior. Pending intervention still forces open.
   */
  defaultWorkflowExpandLevel?: WorkflowExpandLevelDefault;
  disableEditing?: boolean;
  /**
   * Skip the completion auto-collapse (semi → collapsed, an animated Accordion
   * height transition) because the parent is about to fold the whole workflow
   * into `ProcessFold` in a single commit. Collapsing twice — once as a
   * multi-frame animation, once as the fold swap — is what makes the
   * conversation visibly jitter when a turn with tool calls finishes.
   */
  suppressAutoCollapse?: boolean;
  workflowChromeComplete?: boolean;
}

const resolveExpandDefaults = (
  raw: WorkflowExpandLevelDefault | undefined,
): { completion?: WorkflowExpandLevel; streaming?: WorkflowExpandLevel } => {
  if (raw === undefined) return {};
  if (typeof raw === 'string') return { completion: raw, streaming: raw };
  return raw;
};

const collectTools = (blocks: RenderableAssistantContentBlock[]): ChatToolPayloadWithResult[] => {
  return blocks.flatMap((b) => b.tools ?? []);
};

const hasPendingIntervention = (tools: ChatToolPayloadWithResult[]) => {
  return tools.some((tool) => tool.intervention?.status === 'pending');
};

const useDebouncedHeadline = (raw: string, allComplete: boolean, immediate = false) => {
  const [out, setOut] = useState(raw);
  const prevCompleteRef = useRef(allComplete);

  useEffect(() => {
    const wasComplete = prevCompleteRef.current;
    prevCompleteRef.current = allComplete;
    const streaming = !allComplete;

    if (immediate) {
      setOut(raw);
      return;
    }
    if (!streaming) {
      setOut(raw);
      return;
    }
    if (wasComplete) {
      setOut(raw);
      return;
    }
    const id = window.setTimeout(() => setOut(raw), WORKFLOW_HEADLINE_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [allComplete, immediate, raw]);

  return !allComplete ? out : raw;
};

const useCommittedProseHeadline = (proseSource: string, streaming: boolean) => {
  const [committed, setCommitted] = useState('');

  useEffect(() => {
    if (!streaming) {
      setCommitted('');
      return;
    }
    if (!proseSource.trim()) {
      setCommitted('');
      return;
    }
    const shaped = shapeProseForWorkflowHeadline(proseSource);
    if (!shaped) {
      setCommitted('');
      return;
    }
    const quick = /[。！？.!?]\s*$/.test(shaped);
    const delay = quick ? WORKFLOW_PROSE_QUICK_COMMIT_MS : WORKFLOW_PROSE_IDLE_COMMIT_MS;
    const id = window.setTimeout(() => setCommitted(shaped), delay);
    return () => window.clearTimeout(id);
  }, [proseSource, streaming]);

  return committed;
};

const WorkflowCollapse = memo<WorkflowCollapseProps>(
  ({
    assistantMessageId,
    blocks,
    defaultWorkflowExpandLevel,
    disableEditing,
    suppressAutoCollapse = false,
    workflowChromeComplete = false,
  }) => {
    const { t } = useTranslation('chat');
    const toolCallsUnit = t('task.metrics.toolCallsShort');
    const allTools = useMemo(() => collectTools(blocks), [blocks]);
    const toolsPhaseComplete = areWorkflowToolsComplete(allTools);
    const pendingInterventionPresent = useMemo(() => hasPendingIntervention(allTools), [allTools]);
    const isGenerating = useConversationStore(
      messageStateSelectors.isAssistantGroupItemGenerating(assistantMessageId),
    );
    /** Earliest op startTime for this message — anchors the working timer so
     *  it reflects wall-clock since the op began, not since the component mounted. */
    const opStartTime = useChatStore((s) => {
      const ops = operationSelectors.getOperationsByMessage(assistantMessageId)(s);
      if (ops.length === 0) return undefined;
      return ops.reduce((min, op) => Math.min(min, op.metadata.startTime), Infinity);
    });

    const allComplete = toolsPhaseComplete && (workflowChromeComplete || !isGenerating);
    const summaryText = useMemo(() => getWorkflowSummaryText(blocks), [blocks]);
    const completionStatus = useMemo(() => getWorkflowCompletionStatus(allTools), [allTools]);

    /** Sum of per-round model output duration (not reasoning-only); see ModelPerformance.duration */
    const totalWorkflowMs = useMemo(
      () => blocks.reduce((sum, b) => sum + (b.performance?.duration ?? 0), 0),
      [blocks],
    );
    const durationText = totalWorkflowMs > 0 ? formatReasoningDuration(totalWorkflowMs) : undefined;
    const { streaming: streamingDefault, completion: completionDefault } = useMemo(
      () => resolveExpandDefaults(defaultWorkflowExpandLevel),
      [defaultWorkflowExpandLevel],
    );
    const streamingInitialLevel: WorkflowExpandLevel = streamingDefault ?? 'semi';
    const completionInitialLevel: WorkflowExpandLevel = completionDefault ?? 'collapsed';
    /** When a consumer opts any phase into `full`, treat the workflow as a
     *  "fully expanded" experience — manual expands from collapsed go to
     *  `full` instead of the legacy `semi` cap. Heterogeneous agents rely on
     *  this so all 40+ tool calls stay visible after the user re-expands. */
    const manualExpandLevel: WorkflowExpandLevel =
      streamingDefault === 'full' || completionDefault === 'full' ? 'full' : 'semi';

    const [expandLevel, setExpandLevel] = useState<WorkflowExpandLevel>(() =>
      allComplete ? completionInitialLevel : streamingInitialLevel,
    );
    const userOpenedRef = useRef(false);
    const prevCompleteRef = useRef(allComplete);
    const prevSuppressRef = useRef(suppressAutoCollapse);

    useEffect(() => {
      const wasComplete = prevCompleteRef.current;
      prevCompleteRef.current = allComplete;
      const wasSuppressed = prevSuppressRef.current;
      prevSuppressRef.current = suppressAutoCollapse;

      if (!allComplete && wasComplete) {
        userOpenedRef.current = false;
        setExpandLevel(streamingInitialLevel);
        return;
      }

      const autoCollapsable = !userOpenedRef.current && allTools.length > 0;

      if (allComplete && !wasComplete) {
        if (!suppressAutoCollapse && autoCollapsable) setExpandLevel(completionInitialLevel);
        return;
      }

      // Late release: suppression is held while the turn's operation is still
      // active, so it can lift *after* completion already happened. That is the
      // path where the parent ends up NOT folding into ProcessFold (e.g. a
      // tool-only turn with no final answer), so nothing else will collapse this
      // workflow — apply the completion level now instead.
      if (allComplete && wasSuppressed && !suppressAutoCollapse && autoCollapsable) {
        setExpandLevel(completionInitialLevel);
      }
    }, [
      allComplete,
      allTools.length,
      streamingInitialLevel,
      completionInitialLevel,
      suppressAutoCollapse,
    ]);

    const streaming = !allComplete;
    const forceExpanded = streaming && pendingInterventionPresent;
    const isExpanded = forceExpanded || expandLevel !== 'collapsed';

    useEffect(() => {
      if (streaming && pendingInterventionPresent) {
        setExpandLevel('semi');
      }
    }, [pendingInterventionPresent, streaming]);

    const headlineState = useMemo(() => getWorkflowStreamingHeadlineState(blocks), [blocks]);
    const committedProse = useCommittedProseHeadline(
      headlineState.kind === 'prose' ? headlineState.proseSource : '',
      streaming,
    );

    const showExpandedWorkingLabel = streaming && isExpanded && !pendingInterventionPresent;
    const pendingInterventionLabel = t('workflow.awaitingConfirmation', {
      defaultValue: 'Awaiting your confirmation',
    });
    const workingLabel = t('workflow.working', { defaultValue: 'Working...' });
    const expandedWorkingLabel =
      allTools.length > 0 ? `${allTools.length} ${toolCallsUnit}` : workingLabel;
    const streamingHeadlineRaw = useMemo(() => {
      if (pendingInterventionPresent) return pendingInterventionLabel;
      if (showExpandedWorkingLabel) return expandedWorkingLabel;
      switch (headlineState.kind) {
        case 'thinking': {
          return headlineState.reasoningTitle;
        }
        case 'tool': {
          return headlineState.explicitStep || headlineState.fallbackTool;
        }
        case 'prose': {
          return committedProse;
        }
        default: {
          return '';
        }
      }
    }, [
      committedProse,
      expandedWorkingLabel,
      headlineState,
      pendingInterventionLabel,
      pendingInterventionPresent,
      showExpandedWorkingLabel,
    ]);
    const streamingHeadline = useDebouncedHeadline(
      streamingHeadlineRaw,
      allComplete,
      showExpandedWorkingLabel || pendingInterventionPresent,
    );

    const [workingElapsedSeconds, setWorkingElapsedSeconds] = useState(0);
    const accumulatedWorkingMsRef = useRef(0);
    const activeWorkingStartedAtRef = useRef<number | null>(null);

    useEffect(() => {
      if (!streaming) {
        accumulatedWorkingMsRef.current = 0;
        activeWorkingStartedAtRef.current = null;
        setWorkingElapsedSeconds(0);
        return;
      }

      if (pendingInterventionPresent) {
        if (activeWorkingStartedAtRef.current !== null) {
          accumulatedWorkingMsRef.current += Date.now() - activeWorkingStartedAtRef.current;
          activeWorkingStartedAtRef.current = null;
        }
        setWorkingElapsedSeconds(Math.floor(accumulatedWorkingMsRef.current / TIME_MS_PER_SECOND));
        return;
      }

      if (activeWorkingStartedAtRef.current === null) {
        // Initial/remount seeds from op start so elapsed reflects wall-clock
        // since the op began. Intervention resume seeds from now so pause
        // time stays excluded from the accumulator.
        const isInitial = accumulatedWorkingMsRef.current === 0;
        activeWorkingStartedAtRef.current = isInitial && opStartTime ? opStartTime : Date.now();
      }

      const tick = () => {
        const activeMs =
          activeWorkingStartedAtRef.current === null
            ? 0
            : Date.now() - activeWorkingStartedAtRef.current;
        const totalMs = accumulatedWorkingMsRef.current + activeMs;
        setWorkingElapsedSeconds(Math.floor(totalMs / TIME_MS_PER_SECOND));
      };

      tick();
      const interval = setInterval(tick, 1000);

      return () => clearInterval(interval);
    }, [opStartTime, pendingInterventionPresent, streaming]);

    const showWorkingElapsed =
      !pendingInterventionPresent &&
      workingElapsedSeconds >= WORKFLOW_WORKING_ELAPSED_SHOW_AFTER_MS / TIME_MS_PER_SECOND;

    // Keep user expansion and pending-approval ownership when the presentation
    // changes. A pending confirmation cannot disappear behind a collapsed panel.
    const handleExpandedChange = useCallback(
      (nowExpanded: boolean) => {
        if (forceExpanded && !nowExpanded) return;

        if (nowExpanded) {
          setExpandLevel(manualExpandLevel);
          userOpenedRef.current = true;
        } else {
          setExpandLevel('collapsed');
        }
      },
      [forceExpanded, manualExpandLevel],
    );
    const constrained = expandLevel === 'semi';

    const { ref: scrollRef, handleScroll: handleAutoScroll } = useAutoScroll<HTMLDivElement>({
      deps: [allTools.length],
      enabled: constrained,
      threshold: WORKFLOW_EXPANDED_SCROLL_THRESHOLD_PX,
    });

    const statusIcon = streaming ? (
      pendingInterventionPresent ? (
        <HandIcon className="size-4 text-info-text" />
      ) : (
        <Spinner className="size-4" />
      )
    ) : completionStatus === 'error' ? (
      <X aria-label={t('error', { ns: 'common' })} className="size-4 text-destructive" />
    ) : completionStatus === 'partial' ? (
      <AlertTriangle
        aria-label={t('error', { ns: 'common' })}
        className="size-4 text-warning-text"
      />
    ) : (
      <Check className="size-4" />
    );
    const showExpandToggle = expandLevel !== 'collapsed';
    const expandToggleLabel =
      expandLevel === 'semi' ? t('workflow.expandFull') : t('workflow.collapse');
    const handleToggleExpand = () => {
      if (expandLevel === 'semi') {
        setExpandLevel('full');
        userOpenedRef.current = true;
      } else {
        setExpandLevel('semi');
      }
    };

    const headline = streaming
      ? streamingHeadline || (pendingInterventionPresent ? pendingInterventionLabel : workingLabel)
      : summaryText;
    const elapsed = streaming
      ? showWorkingElapsed
        ? formatReasoningDuration(workingElapsedSeconds * TIME_MS_PER_SECOND)
        : undefined
      : durationText;

    return (
      <ChainOfThought open={isExpanded} onOpenChange={handleExpandedChange}>
        <div className="flex items-center gap-2">
          <ChainOfThoughtHeader icon={statusIcon}>
            <span className="flex items-center gap-2">
              <span className={pendingInterventionPresent ? 'text-info-text' : undefined}>
                {headline}
              </span>
              {elapsed && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {streaming ? `(${elapsed})` : elapsed}
                </span>
              )}
            </span>
          </ChainOfThoughtHeader>
          {showExpandToggle && (
            <MessageAction tooltip={expandToggleLabel} onClick={handleToggleExpand}>
              {expandLevel === 'semi' ? (
                <Maximize2 className="size-4" />
              ) : (
                <Minimize2 className="size-4" />
              )}
            </MessageAction>
          )}
        </div>
        <ChainOfThoughtContent>
          <WorkflowExpandedList
            assistantId={assistantMessageId}
            blocks={blocks}
            constrained={constrained}
            disableEditing={disableEditing}
            scrollRef={scrollRef}
            streaming={streaming}
            onScroll={handleAutoScroll}
          />
        </ChainOfThoughtContent>
      </ChainOfThought>
    );
  },
);

WorkflowCollapse.displayName = 'WorkflowCollapse';

export default WorkflowCollapse;
