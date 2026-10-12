import { Pause, Play, Repeat, RotateCcw, SkipForward, Square } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';

import ActionIcon from '@/components/ActionIcon';
import { toast } from '@/components/toast';

import { CaseTrigger } from './CaseTrigger';
import { useAgentMockPlayer } from './hooks/useAgentMockPlayer';
import { useAgentMockReplayTarget } from './hooks/useAgentMockReplayTarget';
import { useMockCases } from './hooks/useMockCases';
import { useAgentMockStore } from './store/agentMockStore';

const styles = {
  actions:
    'flex min-h-10 shrink-0 items-center gap-1 border-be border-divider px-3 pointer-coarse:min-h-[calc(var(--spacing)*11.25)]',
  controls: 'flex shrink-0 flex-col',
  counter: 'text-xs leading-5 tabular-nums text-muted-foreground',
  progress:
    'group/progress flex h-7 shrink-0 touch-none cursor-pointer items-center border-be border-divider px-3 focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50 focus-visible:outline-none pointer-coarse:h-11',
  progressFill:
    'pointer-events-none absolute inset-y-0 start-0 h-full rounded-[inherit] bg-foreground transition-[width] duration-(--orvilo-motion-mid) ease-linear motion-reduce:transition-none',
  progressTrack:
    'relative h-1 flex-1 overflow-hidden rounded-full bg-selected group-hover/progress:bg-accent data-[scrubbing=true]:bg-accent',
};

const COMPACT_ACTION_SIZE = {
  blockSize: 32,
  borderRadius: 'var(--radius-button)',
  size: 16,
} as const;

// Coarse trigger allocates44px; one existing border needs45px outer space.
const SELECTION_CLASS =
  'flex h-11 shrink-0 items-center gap-2 border-be border-divider px-3 pointer-coarse:h-[calc(var(--spacing)*11.25)]';

export const Controls = memo(() => {
  const selectedCaseId = useAgentMockStore((s) => s.selectedCaseId);
  const playback = useAgentMockStore((s) => s.playback);
  const loop = useAgentMockStore((s) => s.loop);
  const setLoop = useAgentMockStore((s) => s.setLoop);

  const { all } = useMockCases();
  const selected = all.find((c) => c.id === selectedCaseId);
  const { pause, resume, seekToEventIndex, start, stepEvent, stop } = useAgentMockPlayer();
  const resolveReplayTarget = useAgentMockReplayTarget();

  const status = playback?.status;
  const running = status === 'running';
  const paused = status === 'paused';
  const idleOrComplete = !playback || status === 'idle' || status === 'complete';
  const disabled = !selected;
  const stoppable = playback != null && status !== 'idle';

  const progressRef = useRef<HTMLDivElement | null>(null);
  const [scrubbing, setScrubbing] = useState(false);

  const launchCase = useCallback(() => {
    if (!selected) return;
    const { agentId, threadId, topicId } = resolveReplayTarget();
    if (!agentId) {
      toast.warning('Open an agent conversation first.');
      return;
    }
    if (!topicId) {
      toast.warning('Open a topic before playing a mock case.');
      return;
    }
    start({ agentId, case: selected, threadId, topicId });
  }, [resolveReplayTarget, selected, start]);

  const handlePlay = useCallback(() => {
    if (idleOrComplete) {
      launchCase();
      return;
    }
    if (paused) resume();
    else if (running) pause();
  }, [idleOrComplete, launchCase, pause, paused, resume, running]);

  const handleReplay = useCallback(() => {
    if (!selected) return;
    if (playback && status !== 'idle') seekToEventIndex(0);
    launchCase();
  }, [launchCase, playback, seekToEventIndex, selected, status]);

  const seekFromClientX = useCallback(
    (clientX: number) => {
      const total = playback?.totalEvents;
      if (!total) return;
      const el = progressRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      seekToEventIndex(Math.round(ratio * total));
    },
    [playback?.totalEvents, seekToEventIndex],
  );

  const handleScrubStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!playback || !playback.totalEvents) return;
      if (e.button !== 0) return;
      e.preventDefault();
      setScrubbing(true);
      seekFromClientX(e.clientX);
    },
    [playback, seekFromClientX],
  );

  useEffect(() => {
    if (!scrubbing) return;
    const onMove = (e: PointerEvent) => seekFromClientX(e.clientX);
    const onUp = () => setScrubbing(false);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [scrubbing, seekFromClientX]);

  const pct = playback?.totalEvents
    ? Math.min(100, (playback.currentEventIndex / playback.totalEvents) * 100)
    : 0;

  return (
    <div className={styles.controls}>
      <div className={SELECTION_CLASS}>
        <CaseTrigger placement={'topLeft'} />
        <span className="flex-1" />
        <span className={styles.counter}>
          {playback ? `${playback.currentEventIndex}/${playback.totalEvents}` : '—'}
        </span>
      </div>
      <div
        aria-valuemax={playback?.totalEvents ?? 0}
        aria-valuemin={0}
        aria-valuenow={playback?.currentEventIndex ?? 0}
        className={styles.progress}
        ref={progressRef}
        role={'slider'}
        tabIndex={0}
        onPointerDown={handleScrubStart}
      >
        <div className={styles.progressTrack} data-scrubbing={scrubbing || undefined}>
          <div className={styles.progressFill} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className={styles.actions}>
        <ActionIcon
          className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
          disabled={disabled}
          icon={running ? Pause : Play}
          size={COMPACT_ACTION_SIZE}
          title={running ? 'Pause' : paused ? 'Resume' : 'Play'}
          onClick={handlePlay}
        />
        <ActionIcon
          className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
          disabled={disabled}
          icon={SkipForward}
          size={COMPACT_ACTION_SIZE}
          title={'Next event'}
          onClick={stepEvent}
        />
        <ActionIcon
          className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
          disabled={disabled}
          icon={RotateCcw}
          size={COMPACT_ACTION_SIZE}
          title={'Replay from start'}
          onClick={handleReplay}
        />
        <ActionIcon
          active={loop}
          aria-pressed={loop}
          className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
          icon={Repeat}
          size={COMPACT_ACTION_SIZE}
          title={loop ? 'Loop on' : 'Loop off'}
          onClick={() => setLoop(!loop)}
        />
        <ActionIcon
          danger
          className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
          disabled={!stoppable}
          icon={Square}
          size={COMPACT_ACTION_SIZE}
          title={'Stop playback'}
          onClick={stop}
        />
        <span className="flex-1" />
        <span className={styles.counter}>{selected ? selected.name : 'No case selected'}</span>
      </div>
    </div>
  );
});

Controls.displayName = 'AgentMockControls';
