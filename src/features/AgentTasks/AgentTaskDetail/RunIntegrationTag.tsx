'use client';

import { PreviewCard } from '@base-ui/react/preview-card';
import type { TaskTopicIntegration } from '@orvilo/types';
import { cssVar } from 'antd-style';
import type { LucideIcon } from 'lucide-react';
import {
  CircleCheck,
  CircleDashed,
  CircleMinus,
  CircleX,
  Loader2,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge as Tag } from '@/components/reui/badge';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { POPUP_Z_CLASS } from '@/components/ui/zIndex';
import { taskService } from '@/services/task';
import { useTaskStore } from '@/store/task';

/**
 * A run row's workspace-integration state — where the branch this run produced
 * stands on its way back onto the base branch.
 *
 * A provisioned run does its work on a `task/<id>` branch that later has to
 * land; without this chip the feed ends at "run completed" and a reader has no
 * way to tell whether the work made it back, is still merging, or died on a
 * conflict. The chip carries only the state; the branch, attempts, conflicting
 * paths and the recorded error live in the tooltip so the row stays a row.
 */
const STATE_META: Record<
  TaskTopicIntegration['state'],
  { color: string; icon: LucideIcon; spin?: boolean }
> = {
  // Corrective attempts are exhausted or the merge path failed — a person has
  // to look, so this is the one state that gets the error color.
  blocked: { color: cssVar.colorError, icon: CircleX },
  // Conflicted, with a corrective run dispatched or in flight — recoverable,
  // so warning rather than error.
  conflict: { color: cssVar.colorWarning, icon: TriangleAlert },
  integrated: { color: cssVar.colorSuccess, icon: CircleCheck },
  merging: { color: cssVar.colorInfo, icon: Loader2, spin: true },
  pending: { color: cssVar.colorTextTertiary, icon: CircleDashed },
  publish_failed: { color: cssVar.colorError, icon: CircleX },
  skipped: { color: cssVar.colorTextTertiary, icon: CircleMinus },
  verification_pending: { color: cssVar.colorWarning, icon: TriangleAlert },
};

interface RunIntegrationTagProps {
  integration?: TaskTopicIntegration | null;
  taskId?: string;
  topicId?: string;
}

const RunIntegrationTag = memo<RunIntegrationTagProps>(({ integration, taskId, topicId }) => {
  const { t } = useTranslation('chat');
  const refreshTaskDetail = useTaskStore((s) => s.internal_refreshTaskDetail);
  const [retrying, setRetrying] = useState(false);

  // Runs without a provisioned worktree have nothing to integrate — the row
  // keeps exactly what it has today.
  if (!integration) return null;

  const meta = STATE_META[integration.state] ?? STATE_META.pending;
  // An unrecognized persisted state still shows its raw value rather than a
  // guessed label — the chip should never claim a state it doesn't have.
  const label = t(`taskDetail.integration.state.${integration.state}` as const, {
    defaultValue: integration.state,
  });
  const retryable =
    integration.state === 'publish_failed' || integration.state === 'verification_pending';

  const retry = async () => {
    if (!taskId || !topicId || retrying) return;
    setRetrying(true);
    try {
      await taskService.retryIntegration(taskId, topicId);
      await refreshTaskDetail(taskId);
      toast.success(t('taskDetail.integration.retryStarted'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('taskDetail.integration.retryFailed'));
    } finally {
      setRetrying(false);
    }
  };

  const tooltip = (
    <div className="flex flex-col gap-1" style={{ maxWidth: 320 }}>
      <div
        className="text-[12px] text-muted-foreground"
        style={{ fontFamily: cssVar.fontFamilyCode }}
      >
        {integration.branch} → {integration.baseBranch}
        {integration.integratedSha ? ` @ ${integration.integratedSha.slice(0, 7)}` : ''}
      </div>
      {integration.role === 'integrate' && (
        <div className="text-[12px] text-muted-foreground">
          {t('taskDetail.integration.mergeRun')}
        </div>
      )}
      {integration.attempts > 0 && (
        <div className="text-[12px] text-muted-foreground">
          {t('taskDetail.integration.attempts', { count: integration.attempts })}
        </div>
      )}
      {!!integration.conflicts?.length && (
        <div className="text-[12px] text-muted-foreground" style={{ wordBreak: 'break-all' }}>
          {t('taskDetail.integration.conflicts', { files: integration.conflicts.join(', ') })}
        </div>
      )}
      {integration.lastError && (
        <div className="text-[12px] text-destructive" style={{ wordBreak: 'break-all' }}>
          {integration.lastError}
        </div>
      )}
      {integration.prUrl && (
        <a
          href={integration.prUrl}
          rel={'noopener noreferrer'}
          style={{ color: cssVar.colorInfo, fontSize: 12 }}
          target={'_blank'}
          onClick={(event) => event.stopPropagation()}
        >
          {t('taskDetail.integration.openPr')}
        </a>
      )}
      {retryable && taskId && topicId && (
        <Button
          loading={retrying}
          size="sm"
          onClick={(event) => {
            event.stopPropagation();
            void retry();
          }}
        >
          {<RefreshCw size={12} />}
          {t(
            integration.state === 'publish_failed'
              ? 'taskDetail.integration.retryPublish'
              : 'taskDetail.integration.recheck',
          )}
        </Button>
      )}
    </div>
  );

  const StateGlyph = meta.icon;

  const tag = (
    <Tag
      size="sm"
      style={{ cursor: integration.prUrl && !retryable ? 'pointer' : undefined, flexShrink: 0 }}
      onClick={
        integration.prUrl && !retryable
          ? (event) => {
              event.stopPropagation();
              window.open(integration.prUrl, '_blank', 'noopener,noreferrer');
            }
          : undefined
      }
    >
      {
        <StateGlyph
          className={meta.spin ? 'animate-spin' : undefined}
          color={meta.color}
          size={12}
        />
      }
      {label}
    </Tag>
  );

  // Hover card, not a tooltip: the popup carries a retry button and a PR link
  // the reader can actually click, which a tooltip's dismiss-on-leave forbids.
  return (
    <PreviewCard.Root>
      <PreviewCard.Trigger render={<span style={{ display: 'inline-flex' }}>{tag}</span>} />
      <PreviewCard.Portal>
        <PreviewCard.Positioner className={POPUP_Z_CLASS} side={'top'} sideOffset={4}>
          <PreviewCard.Popup
            className={`${POPUP_Z_CLASS} flex flex-col rounded-lg bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10`}
          >
            {tooltip}
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  );
});

RunIntegrationTag.displayName = 'RunIntegrationTag';

export default RunIntegrationTag;
