import type { VerifyCheckItem } from '@orvilo/types';
import { cn } from 'cn';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Circle,
  CircleAlert,
  LoaderCircle,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import { createElement, memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import RingLoadingIcon from '@/components/RingLoading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { VerifyCheckResultItem } from '@/database/schemas/verify';
import { useIsDark } from '@/hooks/useIsDark';
import { verifyService } from '@/services/verify';
import { useChatStore } from '@/store/chat';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

import { useVerifyResults, useVerifyState } from '../hooks';
import { countResults, phaseFromStatus } from '../utils';

const styles = {
  actions: 'mt-3 border-t border-sidebar-border',
  body: 'border-t border-sidebar-border px-3 pt-0 pb-3',
  // RunResult already owns the divider in the embedded card.
  bodyEmbedded: 'border-t-0',
  checkRow:
    'grid grid-cols-[20px_minmax(0,1fr)_auto] items-start gap-2 py-3 not-last:border-b not-last:border-sidebar-border',
  chevron: 'flex-none text-(--ant-color-text-quaternary)',
  clickable:
    'cursor-pointer transition-[background] duration-150 ease-(--ant-motion-ease-out) hover:bg-(--ant-color-fill-quaternary)',
  desc: 'mt-[3px] text-[12px] leading-[1.45] text-(--ant-color-text-tertiary)',
  dock: 'overflow-hidden rounded-[16px] border border-border bg-popover',
  head: 'flex cursor-pointer items-center justify-between gap-3 px-3 py-[11px]',
  inputPanel:
    'mt-2.5 rounded-[12px] border border-sidebar-border bg-(--ant-color-fill-quaternary) p-2.5',
  sub: 'truncate text-[12px] text-(--ant-color-text-tertiary)',
  title: 'text-[13px] font-bold text-foreground',
};

const statusIcon = (
  status: VerifyCheckResultItem['status'] | undefined,
): { color: string; icon: typeof CheckCircle2; spin: boolean } => {
  switch (status) {
    case 'passed': {
      return { color: 'var(--success)', icon: CheckCircle2, spin: false };
    }
    case 'running': {
      return { color: 'var(--info)', icon: LoaderCircle, spin: true };
    }
    case 'failed': {
      return { color: 'var(--destructive)', icon: XCircle, spin: false };
    }
    case 'skipped': {
      return { color: 'var(--ant-color-text-quaternary)', icon: CircleAlert, spin: false };
    }
    default: {
      return { color: 'var(--ant-color-text-quaternary)', icon: Circle, spin: false };
    }
  }
};

interface CheckerDockProps {
  /** Render only the checker body (items + actions), no dock chrome / header — for the merged verify card. */
  embedded?: boolean;
  operationId: string;
}

/**
 * The delivery checker dock — replaces the chat composer during a run. Mirrors
 * the reference mock: a collapsible card driving the plan state machine
 * (draft → verifying → failed/repairing → passed) with confirm / edit / skip.
 */
const CheckerDock = memo<CheckerDockProps>(({ operationId, embedded }) => {
  const isDarkMode = useIsDark();
  const { t } = useTranslation('verify');
  const { data: state, mutate: mutateState } = useVerifyState(operationId);
  const { data: results, mutate: mutateResults } = useVerifyResults(operationId);
  const openVerifyResult = useChatStore((s) => s.openVerifyResult);

  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draftItems, setDraftItems] = useState<VerifyCheckItem[]>([]);
  const [busy, setBusy] = useState(false);

  const plan = state?.verifyPlan ?? [];
  const phase = phaseFromStatus(state?.verifyStatus);
  const counts = countResults(results ?? []);
  const resultByItem = new Map((results ?? []).map((r) => [r.checkItemId, r]));

  if (phase === 'idle' || plan.length === 0) return null;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await Promise.all([mutateState(), mutateResults()]);
    } finally {
      setBusy(false);
    }
  };

  const onConfirm = () => run(() => verifyService.confirmPlan(operationId));
  const onSkip = () => run(() => verifyService.skipPlan(operationId));
  const startEdit = () => {
    setDraftItems(plan.map((i) => ({ ...i })));
    setEditing(true);
    setExpanded(true);
  };
  const saveEdit = () =>
    run(async () => {
      await verifyService.updateDraftItems(
        operationId,
        draftItems.map((item, index) => ({ ...item, index })),
      );
      setEditing(false);
    });

  const subText = (() => {
    const map: Record<string, string> = {
      draft: t('status.draft', { total: plan.length }),
      errored: t('status.errored'),
      failed: t('status.failed'),
      passed: t('status.passed', { passed: counts.passed, total: counts.total }),
      repairing: t('status.repairing'),
      verifying: t('status.checking', { passed: counts.passed, total: counts.total }),
    };
    return map[phase] ?? t('status.idle');
  })();

  const renderCheckRow = (item: VerifyCheckItem) => {
    const result = resultByItem.get(item.id);
    const sIcon = statusIcon(result?.status);
    const evidence = result?.toulmin?.reasoning || result?.suggestion;
    return (
      <div
        {...clickableProps()}
        className={cn(styles.checkRow, styles.clickable, CLICKABLE_FOCUS_RING)}
        key={item.id}
        onClick={() => openVerifyResult(operationId, item.id)}
      >
        {result?.status === 'running' ? (
          <RingLoadingIcon
            size={16}
            style={{ color: 'var(--warning)' }}
            ringColor={
              isDarkMode
                ? 'var(--ant-color-warning-border)'
                : `color-mix(in srgb, var(--warning) 45%, transparent)`
            }
          />
        ) : (
          <sIcon.icon className="animate-spin" color={sIcon.color} size={16} />
        )}
        <div className="flex flex-col" style={{ minWidth: 0 }}>
          <span className={styles.title} style={{ fontWeight: 600 }}>
            {item.title}
          </span>
          {evidence && <span className={styles.desc}>{evidence}</span>}
        </div>
        <ChevronRight className={styles.chevron} size={16} style={{ marginBlockStart: 2 }} />
      </div>
    );
  };

  const renderEditor = () => (
    <div className="flex flex-col gap-2">
      {draftItems.map((item, index) => (
        <div className="flex items-center gap-[7px]" key={item.id}>
          <Input
            placeholder={t('editor.placeholder')}
            value={item.title}
            onChange={(e) => {
              const next = [...draftItems];
              next[index] = { ...item, title: e.target.value };
              setDraftItems(next);
            }}
          />
          <ActionIcon
            aria-label={t('delete', { ns: 'common' })}
            icon={Trash2}
            size="small"
            onClick={() => setDraftItems(draftItems.filter((_, i) => i !== index))}
          />
        </div>
      ))}
      <Button
        className="w-full border-dashed"
        size="sm"
        variant="outline"
        onClick={() =>
          setDraftItems([
            ...draftItems,
            {
              id: `tmp-${draftItems.length}-${Date.now()}`,
              index: draftItems.length,
              onFail: 'manual',
              required: false,
              sourceCriterionId: null,
              sourceRubricId: null,
              title: '',
              verifierConfig: {},
              verifierType: 'llm',
            },
          ])
        }
      >
        <Plus data-icon="inline-start" />
        {t('editor.add')}
      </Button>
      <div className="flex gap-2">
        <Button loading={busy} size="sm" variant="default" onClick={saveEdit}>
          {t('editor.save')}
        </Button>
        <Button size="sm" onClick={() => setEditing(false)}>
          {t('editor.cancel')}
        </Button>
      </div>
    </div>
  );

  const renderActions = () => {
    if (phase === 'draft')
      return (
        <div className="flex gap-2" style={{ flexWrap: 'wrap', marginTop: 12 }}>
          <Button loading={busy} size="sm" variant="default" onClick={onConfirm}>
            {t('dock.confirm')}
          </Button>
          <Button size="sm" onClick={startEdit}>
            {t('dock.edit')}
          </Button>
          <Button size="sm" onClick={onSkip}>
            {t('dock.skip')}
          </Button>
        </div>
      );
    if (phase === 'repairing')
      return (
        <div className={styles.inputPanel} style={{ marginTop: 10 }}>
          <div className={styles.desc}>{t('dock.repairHint')}</div>
        </div>
      );
    return null;
  };

  const body = (
    <div className={cn(styles.body, embedded && styles.bodyEmbedded)}>
      {editing ? (
        renderEditor()
      ) : (
        <>
          <div className="flex flex-col gap-0">{plan.map((item) => renderCheckRow(item))}</div>
          {(() => {
            const actions = renderActions();
            return actions ? <div className={styles.actions}>{actions}</div> : null;
          })()}
        </>
      )}
    </div>
  );

  // Merged verify card: just the checker body (items + actions), no dock chrome.
  if (embedded) return body;

  const headIcon =
    phase === 'passed'
      ? Check
      : phase === 'failed' || phase === 'errored'
        ? ShieldAlert
        : ShieldCheck;

  return (
    <div className={styles.dock}>
      <div
        {...clickableProps()}
        className={cn(styles.head, CLICKABLE_FOCUS_RING)}
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2.5" style={{ minWidth: 0 }}>
          {createElement(headIcon, { size: 18 })}
          <div className="flex flex-col" style={{ minWidth: 0 }}>
            <div className="flex items-center gap-2">
              <span className={styles.title}>{t('dock.title')}</span>
            </div>
            <span className={styles.sub}>{subText}</span>
          </div>
        </div>
        {expanded ? (
          <ChevronDown color={'var(--ant-color-text-tertiary)'} size={16} />
        ) : (
          <ChevronUp color={'var(--ant-color-text-tertiary)'} size={16} />
        )}
      </div>
      {expanded && body}
    </div>
  );
});

CheckerDock.displayName = 'CheckerDock';

export default CheckerDock;
