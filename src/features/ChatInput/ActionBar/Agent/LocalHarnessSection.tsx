'use client';

import type { HeterogeneousAgentType } from '@orvilo/heterogeneous-agents';
import { createStaticStyles, cx } from 'antd-style';
import isEqual from 'fast-deep-equal';
import { ChevronDown, ChevronRight, CircleAlert } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { useAgentScan } from '@/features/ConnectAgent/useAgentScan';
import { useHomeStore } from '@/store/home';
import { homeAgentListSelectors } from '@/store/home/selectors';

import {
  buildLocalHarnessRows,
  collectConnectedHarnessTypes,
  type LocalHarnessRow,
} from './localHarnessRows';

const styles = createStaticStyles(({ css, cssVar }) => ({
  connect: css`
    flex: none;
    font-size: 12px;
    color: ${cssVar.colorPrimary};
  `,
  hint: css`
    padding-block: 6px;
    padding-inline: 8px;
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
  name: css`
    overflow: hidden;

    font-size: 13px;
    color: ${cssVar.colorTextSecondary};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  root: css`
    margin-block-start: 4px;
    padding-block-start: 4px;
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};
  `,
  row: css`
    cursor: pointer;

    display: flex;
    gap: 8px;
    align-items: center;

    padding-block: 6px;
    padding-inline: 8px;
    border-radius: ${cssVar.borderRadius};

    &:hover {
      background: ${cssVar.colorFillSecondary};
    }
  `,
  // Not installed: still listed (behind the expander) so the user can tell
  // "not on this machine" from "the picker forgot about it".
  rowDisabled: css`
    cursor: default;

    &:hover {
      background: transparent;
    }
  `,
  status: css`
    display: flex;
    gap: 6px;
    align-items: center;

    padding-block: 6px;
    padding-inline: 8px;

    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
  statusText: css`
    overflow: hidden;
    flex: 1;

    min-width: 0;

    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  subtitle: css`
    overflow: hidden;

    font-size: 11px;
    line-height: 14px;
    color: ${cssVar.colorTextTertiary};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  text: css`
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  `,
}));

interface LocalHarnessSectionProps {
  /**
   * Opens the connect flow for a harness the user picked here. Deliberately a
   * callback rather than a direct `openConnectAgentModal` call: the picker owns
   * closing its popover before the wizard takes over.
   */
  onConnect: (type: HeterogeneousAgentType) => void;
}

/**
 * "Installed on this device" — the composer picker's answer to "what agent
 * runtimes do I actually have locally?".
 *
 * The agent list above only shows agents that were already created, so a
 * machine full of Claude Code / Codex / OpenCode installs looks empty until the
 * user walks through the connect wizard. This section probes the desktop binary
 * detector instead and offers what the probe finds minus what is already
 * connected — see the filter note on `rows` below, which is the part readers
 * get wrong.
 *
 * Connecting stays explicit: a row here only opens the existing connect wizard
 * (nothing is written from chat), which is what keeps the composer's promise
 * that a chat-side pick never mutates an agent row.
 */
const LocalHarnessSection = memo<LocalHarnessSectionProps>(({ onConnect }) => {
  const { t } = useTranslation('chat');
  const { scan, state } = useAgentScan();
  const [showMissing, setShowMissing] = useState(false);

  // Probe when the picker opens. The section unmounts with the popover, so
  // reopening the picker is itself the implicit retry for a failed scan; the
  // explicit Retry below covers the panel staying open.
  useEffect(() => {
    void scan({ kind: 'local' });
  }, [scan]);

  const agentList = useHomeStore(homeAgentListSelectors.allAgents, isEqual);
  // What this section lists is **installed and not yet connected**, never "what
  // this machine has": harnesses that already own an agent row are dropped
  // (`collectConnectedHarnessTypes`, ./localHarnessRows), so the two counts
  // differ by each connected harness the probe also finds — verified here:
  // probe 9 available, this list 8. Read the rows below as a to-connect queue,
  // not as an inventory. Reusing them as a capability overview silently loses
  // every connected entry, and the omission leaves no trace in the data.
  const connectedTypes = useMemo(() => collectConnectedHarnessTypes(agentList), [agentList]);
  const rows = useMemo(
    () => buildLocalHarnessRows(state.agents, connectedTypes),
    [connectedTypes, state.agents],
  );

  const installed = rows.filter((row) => row.available);
  const missing = rows.filter((row) => !row.available);

  const retry = useCallback(() => {
    void scan({ kind: 'local' });
  }, [scan]);

  const renderRow = (row: LocalHarnessRow) => {
    const { provider } = row;
    // The subtitle is the whole reason a row exists here: the version proves
    // the probe really found the binary, and the failure text says why a
    // harness the user knows is installed did not answer.
    const subtitle = row.available
      ? row.version
      : (row.reason ?? t('connectAgent.create.notInstalled'));

    if (!row.available) {
      return (
        <div className={cx(styles.row, styles.rowDisabled)} key={provider.type}>
          <provider.brand.Avatar size={20} />
          <div className={styles.text}>
            <div className={styles.name}>{provider.title}</div>
            <div className={styles.subtitle} title={row.reason}>
              {subtitle}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        className={styles.row}
        key={provider.type}
        role={'button'}
        tabIndex={0}
        onClick={() => onConnect(provider.type)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          onConnect(provider.type);
        }}
      >
        <provider.brand.Avatar size={20} />
        <div className={styles.text}>
          <div className={styles.name}>{provider.title}</div>
          {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
        </div>
        <span className={styles.connect}>{t('localHarness.connect')}</span>
      </div>
    );
  };

  // `idle` is the first paint before the mount effect fires — same waiting
  // state as `scanning`, never an empty list (which reads as "nothing here").
  const waiting = state.status === 'idle' || state.status === 'scanning';

  return (
    <div className={styles.root}>
      {waiting && <div className={styles.hint}>{t('localHarness.scanning')}</div>}

      {/* `useAgentScan` sets this status on its **device** branch
          (`deviceService.scanAgents` returning `result.error`, or a throw caught
          below it). This section always scans `{ kind: 'local' }`, and `scanLocal`
          catches every provider, so `Promise.all` never rejects — a broken local
          probe settles as "success, nothing installed" instead, which the empty
          state's Rescan covers. So it is unreachable today and becomes live the
          day this section scans a device; if that never happens, it is dead UI
          and belongs in the bin with the rest. */}
      {state.status === 'error' && (
        <div className={styles.status}>
          <CircleAlert size={13} />
          <span className={styles.statusText} title={state.error}>
            {t('localHarness.scanFailed')}
          </span>
          <Button size={'xs'} variant={'ghost'} onClick={retry}>
            {t('retry', { ns: 'common' })}
          </Button>
        </div>
      )}

      {state.status === 'success' && (
        <>
          {installed.length > 0 ? (
            <>
              <div
                className={'text-[12px] text-muted-foreground font-medium'}
                style={{ paddingBlock: 4, paddingInline: 8 }}
              >
                {t('localHarness.title')}
              </div>
              {installed.map(renderRow)}
            </>
          ) : (
            <>
              <div className={styles.hint}>{t('localHarness.noneInstalled')}</div>
              {/* The probe reports per-harness failures instead of rejecting, so
                  "found nothing" is also how a broken PATH or a missing desktop
                  bridge shows up. Rescan is the recovery for both. */}
              <Button size={'xs'} variant={'ghost'} onClick={retry}>
                {t('connectAgent.create.rescan')}
              </Button>
            </>
          )}

          {missing.length > 0 && (
            <>
              <Button size={'xs'} variant={'ghost'} onClick={() => setShowMissing((prev) => !prev)}>
                {showMissing ? <ChevronDown /> : <ChevronRight />}
                {showMissing
                  ? t('localHarness.hideMissing')
                  : t('localHarness.showMissing', { total: missing.length })}
              </Button>
              {showMissing && missing.map(renderRow)}
            </>
          )}
        </>
      )}
    </div>
  );
});

LocalHarnessSection.displayName = 'LocalHarnessSection';

export default LocalHarnessSection;
