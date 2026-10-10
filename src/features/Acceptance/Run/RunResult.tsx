import { cn } from 'cn';
import { Info, Shield, ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { useVerifyResults, useVerifyState } from '../hooks';
import { countResults, type DockPhase, phaseFromStatus } from '../utils';

const styles = {
  body: 'px-4 py-3 text-[13px] leading-[1.7] text-muted-foreground',
  card: 'overflow-hidden rounded-[16px] border border-sidebar-border bg-card',
  cardFailed: 'border-(--ant-color-error-border)',
  foot: 'flex items-center gap-2 border-t border-sidebar-border px-4 py-2.5 text-[12px] text-(--ant-color-text-tertiary)',
  head: 'flex items-start gap-3.5 border-b border-sidebar-border px-4 py-3.5',
  status: 'text-[13px] font-semibold',
  sub: 'mt-1 text-[12px] leading-normal text-(--ant-color-text-tertiary)',
  title: 'text-[15px] font-bold text-foreground',
};

interface BadgeMeta {
  color: 'default' | 'success' | 'error' | 'warning';
  /** Shield family only: the glyph is the block's identity AND its verdict. */
  icon: typeof Shield;
  key: 'pending' | 'failed' | 'errored' | 'repairing' | 'passed';
}

const phaseToResult: Record<DockPhase, { badge: BadgeMeta; subKey: string } | null> = {
  draft: {
    badge: { color: 'default', icon: Shield, key: 'pending' },
    subKey: 'result.pending.sub',
  },
  errored: {
    // Warning, not error: the verifier couldn't run, so the delivery was never
    // judged — never render it as a failed check.
    badge: { color: 'warning', icon: ShieldAlert, key: 'errored' },
    subKey: 'result.errored.sub',
  },
  failed: {
    badge: { color: 'error', icon: ShieldX, key: 'failed' },
    subKey: 'result.failed.sub',
  },
  idle: {
    badge: { color: 'default', icon: Shield, key: 'pending' },
    subKey: 'result.pending.sub',
  },
  passed: {
    badge: { color: 'success', icon: ShieldCheck, key: 'passed' },
    subKey: 'result.passed.sub',
  },
  repairing: {
    badge: { color: 'warning', icon: ShieldAlert, key: 'repairing' },
    subKey: 'result.repairing.sub',
  },
  verifying: {
    badge: { color: 'default', icon: Shield, key: 'pending' },
    subKey: 'result.pending.sub',
  },
};

interface RunResultProps {
  /** Render only the header (kicker + title + status), no card chrome — for the merged verify card. */
  embedded?: boolean;
  operationId: string;
  /** Display round number (1-based); repair rounds are separate operations. */
  round?: number;
}

/**
 * Inline snapshot card for one Agent Run's verify outcome. Rendered in the chat
 * thread below the assistant message group. Each round (operation) keeps its own
 * result snapshot, so failures are never overwritten by later success.
 */
const RunResult = memo<RunResultProps>(({ operationId, round = 1, embedded }) => {
  const { t } = useTranslation('verify');
  const { data: state } = useVerifyState(operationId);
  const { data: results } = useVerifyResults(operationId);

  const phase = phaseFromStatus(state?.verifyStatus);
  const meta = phaseToResult[phase];
  if (!state?.verifyPlan?.length || !meta) return null;

  const counts = countResults(results ?? []);
  const badgeColorMap = {
    default: 'var(--ant-color-text-tertiary)',
    error: 'var(--destructive)',
    success: 'var(--success)',
    warning: 'var(--warning)',
  } as const;
  // Deeper, more readable text color over the tinted badge fill.
  const badgeTextMap = {
    default: 'var(--muted-foreground)',
    error: 'var(--ant-color-error-text-active)',
    success: 'var(--ant-color-success-text-active)',
    warning: 'var(--ant-color-warning-text-active)',
  } as const;

  // The verdict lives IN the title: the shield changes form and colour with the
  // phase and the status text sits right after the round number, so the reader
  // never has to travel to the far edge of the card — a pill there read as a
  // separate control and left the title looking neutral on a failed round.
  const header = (
    <div className={styles.head}>
      <div className="flex flex-col">
        <div className="flex items-center gap-[7px]">
          <meta.badge.icon
            color={meta.badge.color === 'default' ? undefined : badgeColorMap[meta.badge.color]}
            size={16}
          />
          <span className={styles.title}>{t('result.title', { round })}</span>
          <span className={styles.status} style={{ color: badgeTextMap[meta.badge.color] }}>
            {t(`badge.${meta.badge.key}` as any)}
          </span>
        </div>
        <div className={styles.sub}>
          {t(meta.subKey as any, { passed: counts.passed, total: counts.total } as any)}
        </div>
      </div>
    </div>
  );

  // Merged verify card: header only, no card chrome / summary list / footer.
  if (embedded) return header;

  return (
    <div className={cn(styles.card, phase === 'failed' && styles.cardFailed)}>
      {header}
      <div className={styles.body}>
        <div className="flex flex-col gap-1">
          {(state.verifyPlan ?? []).map((item) => {
            const result = (results ?? []).find((r) => r.checkItemId === item.id);
            return (
              <div className="flex items-center gap-2" key={item.id}>
                <span>{item.title}</span>
                {result?.verdict && (
                  <span
                    style={{
                      color: badgeColorMap[result.verdict === 'passed' ? 'success' : 'error'],
                    }}
                  >
                    · {result.verdict}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className={styles.foot}>
        <Info size={14} />
        <span>{t('result.foot')}</span>
      </div>
    </div>
  );
});

RunResult.displayName = 'RunResult';

export default RunResult;
