'use client';

import { Flexbox, Icon, Tooltip } from '@lobehub/ui';
import { Tag, Text } from '@lobehub/ui/base-ui';
import type { TaskTopicIntegration } from '@orvilo/types';
import { cssVar } from 'antd-style';
import type { LucideIcon } from 'lucide-react';
import {
  CircleCheck,
  CircleDashed,
  CircleMinus,
  CircleX,
  Loader2,
  TriangleAlert,
} from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

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
  skipped: { color: cssVar.colorTextTertiary, icon: CircleMinus },
};

interface RunIntegrationTagProps {
  integration?: TaskTopicIntegration | null;
}

const RunIntegrationTag = memo<RunIntegrationTagProps>(({ integration }) => {
  const { t } = useTranslation('chat');

  // Runs without a provisioned worktree have nothing to integrate — the row
  // keeps exactly what it has today.
  if (!integration) return null;

  const meta = STATE_META[integration.state] ?? STATE_META.pending;
  // An unrecognized persisted state still shows its raw value rather than a
  // guessed label — the chip should never claim a state it doesn't have.
  const label = t(`taskDetail.integration.state.${integration.state}` as const, {
    defaultValue: integration.state,
  });

  const tooltip = (
    <Flexbox gap={4} style={{ maxWidth: 320 }}>
      <Text fontSize={12} style={{ fontFamily: cssVar.fontFamilyCode }} type={'secondary'}>
        {integration.branch} → {integration.baseBranch}
        {integration.integratedSha ? ` @ ${integration.integratedSha.slice(0, 7)}` : ''}
      </Text>
      {integration.role === 'integrate' && (
        <Text fontSize={12} type={'secondary'}>
          {t('taskDetail.integration.mergeRun')}
        </Text>
      )}
      {integration.attempts > 0 && (
        <Text fontSize={12} type={'secondary'}>
          {t('taskDetail.integration.attempts', { count: integration.attempts })}
        </Text>
      )}
      {!!integration.conflicts?.length && (
        <Text fontSize={12} style={{ wordBreak: 'break-all' }} type={'secondary'}>
          {t('taskDetail.integration.conflicts', { files: integration.conflicts.join(', ') })}
        </Text>
      )}
      {integration.lastError && (
        <Text fontSize={12} style={{ wordBreak: 'break-all' }} type={'danger'}>
          {integration.lastError}
        </Text>
      )}
      {integration.prUrl && (
        <a
          href={integration.prUrl}
          rel={'noreferrer'}
          style={{ color: cssVar.colorInfo, fontSize: 12 }}
          target={'_blank'}
          onClick={(event) => event.stopPropagation()}
        >
          {t('taskDetail.integration.openPr')}
        </a>
      )}
    </Flexbox>
  );

  return (
    <Tooltip title={tooltip}>
      <Tag
        icon={<Icon color={meta.color} icon={meta.icon} size={12} spin={meta.spin} />}
        size={'small'}
        style={{ cursor: integration.prUrl ? 'pointer' : undefined, flexShrink: 0 }}
        onClick={
          integration.prUrl
            ? (event) => {
                event.stopPropagation();
                window.open(integration.prUrl, '_blank', 'noopener,noreferrer');
              }
            : undefined
        }
      >
        {label}
      </Tag>
    </Tooltip>
  );
});

RunIntegrationTag.displayName = 'RunIntegrationTag';

export default RunIntegrationTag;
