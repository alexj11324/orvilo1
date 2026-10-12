'use client';

import type { HeterogeneousAgentType } from '@orvilo/heterogeneous-agents';
import isEqual from 'fast-deep-equal';
import { CircleAlert } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { useAgentScan } from '@/features/ConnectAgent/useAgentScan';
import { useHomeStore } from '@/store/home';
import { homeAgentListSelectors } from '@/store/home/selectors';
import { CLICKABLE_FOCUS_RING } from '@/utils/clickableProps';

import {
  buildLocalHarnessRows,
  collectConnectedHarnessTypes,
  type LocalHarnessRow,
} from './localHarnessRows';

const styles = {
  hint: 'py-1.5 px-2 text-sm leading-5.5 text-foreground-tertiary',
  name: 'truncate text-sm leading-5.5 text-muted-foreground',
  root: 'mbs-1 pbs-1 border-bs border-divider',
  row: 'cursor-pointer flex gap-2 items-center py-1.5 px-2 rounded-(--radius-button) hover:bg-accent focus-visible:bg-accent',
  status: 'flex gap-1.5 items-center py-1.5 px-2 text-sm leading-5.5 text-foreground-tertiary',
  statusText: 'truncate flex-1 min-w-0',
  text: 'flex flex-1 flex-col min-w-0',
};

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

  // Only installed harnesses are listed — a connect surface offers what can
  // actually be imported, so uninstalled rows never render.
  const installed = rows.filter((row) => row.available);

  const retry = useCallback(() => {
    void scan({ kind: 'local' });
  }, [scan]);

  const compactActionClass =
    "pointer-coarse:relative pointer-coarse:after:absolute pointer-coarse:after:-inset-1.75 pointer-coarse:after:content-['']";

  const renderRow = (row: LocalHarnessRow) => {
    const { provider } = row;

    return (
      <div
        className={`${styles.row} ${CLICKABLE_FOCUS_RING}`}
        key={provider.type}
        role={'button'}
        tabIndex={0}
        onClick={() => onConnect(provider.type)}
        onKeyDown={(event) => {
          // A keyboard event that started on a nested control is that
          // control's activation — the row must not fire a second one.
          if (event.target !== event.currentTarget) return;
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          onConnect(provider.type);
        }}
      >
        <provider.brand.Avatar size={20} />
        <div className={styles.text}>
          <div className={styles.name}>{provider.title}</div>
        </div>
        <Button
          className={compactActionClass}
          size={'compact'}
          onClick={(event) => {
            event.stopPropagation();
            onConnect(provider.type);
          }}
        >
          {t('localHarness.connect')}
        </Button>
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
          <CircleAlert size={16} />
          <span className={styles.statusText} title={state.error}>
            {t('localHarness.scanFailed')}
          </span>
          <Button className={compactActionClass} size={'compact'} variant={'ghost'} onClick={retry}>
            {t('retry', { ns: 'common' })}
          </Button>
        </div>
      )}

      {state.status === 'success' && (
        <>
          {installed.length > 0 ? (
            <>
              <div className={'py-1 px-2 text-xs leading-5 text-muted-foreground font-medium'}>
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
              <Button
                className={compactActionClass}
                size={'compact'}
                variant={'ghost'}
                onClick={retry}
              >
                {t('connectAgent.create.rescan')}
              </Button>
            </>
          )}
        </>
      )}
    </div>
  );
});

LocalHarnessSection.displayName = 'LocalHarnessSection';

export default LocalHarnessSection;
