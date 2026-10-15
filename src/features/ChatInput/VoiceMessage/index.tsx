'use client';

import { type VoiceMessageRecording } from '@orvilo/types';
import { ArrowUp, type LucideProps, RotateCcw, X } from 'lucide-react';
import { createElement, memo, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

import { ChatInputAction } from '../ActionBar/components/ChatInputAction';
import { ActionBarContext, useActionBarContext } from '../ActionBar/context';
import { useAgentId } from '../hooks/useAgentId';
import { useEffectiveModel } from '../hooks/useEffectiveModel';
import { SimpleTooltip } from '../SimpleTooltip';
import { useChatInputStore, useStoreApi } from '../store';
import { formatVoiceDuration } from './mediaRecorder';
import { useIntentionalHover } from './useIntentionalHover';
import {
  getVoiceMessageActionState,
  getVoiceMessageIdleState,
  useVoiceMessageCapability,
} from './useVoiceMessageCapability';
import { useVoiceMessageRecorder } from './useVoiceMessageRecorder';

const VoiceMessageIcon = ({
  ref,
  size = 24,
  strokeWidth = 2,
  ...rest
}: LucideProps & { ref?: React.RefObject<SVGSVGElement | null> }) => (
  <svg
    fill="none"
    height={size}
    ref={ref}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={strokeWidth}
    viewBox="0 0 24 24"
    width={size}
    {...rest}
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 12h.01" />
    <path d="M11 9.75a3.25 3.25 0 0 1 0 4.5" />
    <path d="M14 7.5a6.25 6.25 0 0 1 0 9" />
  </svg>
);

VoiceMessageIcon.displayName = 'VoiceMessageIcon';

const styles = {
  // Meter interpolation follows useVoiceMessageRecorder's current 80ms sample cadence.
  bar: 'w-1 min-h-1 rounded-full bg-primary transition-[height] duration-[80ms] ease-linear motion-reduce:transition-none',
  // Allocate the full coarse-pointer hit area; keep compact action paint and sizing at 32px.
  actionSlot: 'inline-flex size-8 flex-none items-center justify-center pointer-coarse:size-11',
  action:
    "relative active:not-aria-[haspopup]:translate-y-0 pointer-coarse:after:absolute pointer-coarse:after:-inset-[calc(var(--spacing)*1.75)] pointer-coarse:after:content-['']",
  cancelButton:
    "group/voice-cancel relative cursor-default border-0 bg-transparent p-0 text-muted-foreground hover:bg-transparent hover:text-muted-foreground active:not-aria-[haspopup]:translate-y-0 focus-visible:border-transparent focus-visible:ring-0 focus-visible:shadow-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-primary focus-visible:outline-offset-2 pointer-coarse:after:absolute pointer-coarse:after:-inset-1.5 pointer-coarse:after:content-['']",
  cancelPaint:
    'pointer-events-none inline-flex size-8 items-center justify-center rounded-(--radius-button) bg-selected transition-[color,background-color,transform] duration-(--orvilo-motion-mid) ease-in-out group-hover/voice-cancel:bg-(--fill) group-hover/voice-cancel:text-foreground group-active/voice-cancel:scale-[0.96] motion-reduce:transition-none',
  container:
    'flex h-8 pointer-coarse:h-11 w-[min(300px,calc(100vw_-_112px))] min-w-[min(220px,calc(100vw_-_112px))] flex-none items-center gap-1.5 px-0.5 animate-[orvilo-voice-message-enter_var(--orvilo-motion-mid)_ease-out] motion-reduce:animate-none',
  error:
    'absolute z-1 [inset-block-start:50%] [inset-inline:--spacing(3)_--spacing(11)] [transform:translateY(-50%)] overflow-hidden text-xs text-destructive-text text-center text-ellipsis whitespace-nowrap',
  pill: 'relative flex h-full min-w-0 flex-1 items-center',
  pillPaint:
    'pointer-events-none absolute inset-0 overflow-hidden rounded-full bg-selected pointer-coarse:inset-bs-1.5 pointer-coarse:inset-be-1.5',
  progress:
    'absolute z-3 [inset-block-end:0] [inset-inline:--spacing(1.5)] h-0.5 overflow-hidden rounded-full bg-selected',
  progressValue:
    'h-full rounded-[inherit] bg-card opacity-[0.72] transition-[width] duration-(--orvilo-motion-mid) ease-linear motion-reduce:transition-none',
  sendArrow:
    'absolute z-2 [inset-block-start:50%] [inset-inline-end:--spacing(0.5)] [transform:translateY(-50%)] inline-flex size-7 items-center justify-center opacity-100 transition-[opacity,transform] duration-(--orvilo-motion-mid) ease-in-out group-data-[hover-expanded=true]/voice-send:[transform:translateY(-50%)_translateX(--spacing(1.5))] group-focus-visible/voice-send:[transform:translateY(-50%)_translateX(--spacing(1.5))] group-data-[expanded=true]/voice-send:[transform:translateY(-50%)_translateX(--spacing(1.5))] group-data-[hover-expanded=true]/voice-send:opacity-0 group-focus-visible/voice-send:opacity-0 group-data-[expanded=true]/voice-send:opacity-0 motion-reduce:transition-none',
  sendButton:
    "group/voice-send relative z-2 w-full cursor-default rounded-full border-0 bg-transparent p-0 text-primary-foreground hover:bg-transparent hover:text-primary-foreground active:not-aria-[haspopup]:translate-y-0 [&[data-error=true]:not([data-expanded=true])]:text-destructive-on-fill [&[data-error=true]:not([data-expanded=true])]:hover:text-destructive-on-fill data-[expanded=true]:cursor-wait data-[expanded=true]:text-muted-foreground data-[expanded=true]:hover:text-muted-foreground focus-visible:border-transparent focus-visible:ring-0 focus-visible:shadow-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-primary focus-visible:-outline-offset-3 disabled:cursor-not-allowed disabled:opacity-100 [&[data-expanded=true]:disabled]:cursor-wait pointer-coarse:after:absolute pointer-coarse:after:inset-s-0 pointer-coarse:after:inset-e-0 pointer-coarse:after:-inset-bs-1.5 pointer-coarse:after:-inset-be-1.5 pointer-coarse:after:content-['']",
  sendPaint:
    "pointer-events-none absolute inset-0 overflow-hidden rounded-full before:absolute before:inset-0 before:z-0 before:rounded-[inherit] before:bg-primary before:[clip-path:circle(14px_at_calc(100%_-_16px)_50%)] before:transition-[clip-path] before:duration-(--orvilo-motion-mid) before:ease-[cubic-bezier(0.2,0.8,0.2,1)] before:content-[''] group-[[data-error=true]:not([data-expanded=true])]/voice-send:before:bg-destructive group-data-[expanded=true]/voice-send:bg-card group-data-[expanded=true]/voice-send:before:bg-(--fill) group-data-[hover-expanded=true]/voice-send:before:[clip-path:circle(150%_at_calc(100%_-_16px)_50%)] group-focus-visible/voice-send:before:[clip-path:circle(150%_at_calc(100%_-_16px)_50%)] group-data-[expanded=true]/voice-send:before:[clip-path:circle(150%_at_calc(100%_-_16px)_50%)] group-disabled/voice-send:before:opacity-[0.45] group-[[data-expanded=true]:disabled]/voice-send:before:opacity-100 motion-reduce:before:transition-none",
  sendSlot: 'flex w-full items-center [&>span]:w-full',
  sendDots:
    'inline-flex items-center gap-0.75 [&>i]:size-0.75 [&>i]:rounded-full [&>i]:bg-current group-data-[expanded=true]/voice-send:[&:last-child]:hidden group-data-[expanded=true]/voice-send:[&:first-child>i]:animate-[orvilo-voice-message-busy-dot_900ms_ease-in-out_infinite] group-data-[expanded=true]/voice-send:[&:first-child>i:nth-child(2)]:[animation-delay:120ms] group-data-[expanded=true]/voice-send:[&:first-child>i:nth-child(3)]:[animation-delay:240ms] group-data-[expanded=true]/voice-send:[&:first-child>i:last-child]:hidden motion-reduce:[&>i]:animate-none',
  sendLabel:
    'absolute inset-0 z-2 [transform:translateY(--spacing(1))] flex min-w-0 items-center justify-center gap-2 px-2.5 text-sm font-semibold whitespace-nowrap opacity-0 transition-[opacity,transform] duration-(--orvilo-motion-mid) ease-in-out group-data-[hover-expanded=true]/voice-send:[transform:translateY(0)] group-focus-visible/voice-send:[transform:translateY(0)] group-data-[expanded=true]/voice-send:[transform:translateY(0)] group-data-[hover-expanded=true]/voice-send:opacity-100 group-focus-visible/voice-send:opacity-100 group-data-[expanded=true]/voice-send:opacity-100 group-data-[expanded=true]/voice-send:px-3.5 group-data-[expanded=true]/voice-send:text-xs group-data-[expanded=true]/voice-send:font-normal motion-reduce:transition-none',
  sendText:
    'min-w-0 overflow-hidden text-ellipsis whitespace-nowrap group-data-[expanded=true]/voice-send:hidden',
  waveform: 'pointer-events-none absolute inset-0 z-1 flex items-center justify-center gap-1',
  visuallyHidden: 'sr-only [clip-path:inset(50%)]',
};
export interface VoiceMessageControlProps {
  actionLabel: string;
  actionText?: string;
  cancelLabel: string;
  durationLabel: string;
  errorText?: string;
  expanded?: boolean;
  groupLabel: string;
  isRetry?: boolean;
  onAction: () => void;
  onCancel: () => void;
  progress?: number;
  sendDisabled?: boolean;
  statusAnnouncement: string;
  tooltip?: string;
  waveform: number[];
}

const SendDots = () => (
  <span aria-hidden className={styles.sendDots}>
    {Array.from({ length: 4 }, (_, index) => (
      <i className="motion-reduce:animate-none" key={index} />
    ))}
  </span>
);

export const VoiceMessageControl = memo<VoiceMessageControlProps>(
  ({
    actionLabel,
    actionText,
    cancelLabel,
    durationLabel,
    errorText,
    expanded,
    groupLabel,
    isRetry,
    progress,
    sendDisabled,
    statusAnnouncement,
    tooltip,
    waveform,
    onAction,
    onCancel,
  }) => {
    const sendButtonRef = useRef<HTMLButtonElement>(null);
    const { handlePointerEnter, handlePointerLeave, isHoverExpanded } =
      useIntentionalHover(sendButtonRef);

    return (
      <div
        aria-label={groupLabel}
        className={styles.container}
        data-testid="voice-message-recorder"
        role="group"
      >
        <span aria-live="polite" className={styles.visuallyHidden}>
          {statusAnnouncement}
        </span>
        <span className={styles.actionSlot}>
          <Button
            aria-label={cancelLabel}
            className={styles.cancelButton}
            data-testid="voice-message-cancel"
            size="icon"
            type="button"
            variant="ghost"
            onClick={onCancel}
          >
            <span className={styles.cancelPaint}>
              <span className="anticon" role="img">
                <X fill={'transparent'} height={16} size={16} width={16} />
              </span>
            </span>
          </Button>
        </span>

        <div className={styles.pill} data-testid="voice-message-pill">
          <div className={styles.pillPaint}>
            <span className={styles.visuallyHidden}>{durationLabel}</span>

            {errorText ? (
              <span className={styles.error} title={errorText}>
                {errorText}
              </span>
            ) : (
              <div aria-hidden className={styles.waveform}>
                {waveform.map((level, index) => (
                  <span
                    className={styles.bar}
                    key={index}
                    style={{ height: `${Math.max(4, Math.round(level * 18))}px` }}
                  />
                ))}
              </div>
            )}

            {progress !== undefined && (
              <div aria-hidden className={styles.progress}>
                <div className={styles.progressValue} style={{ width: `${progress}%` }} />
              </div>
            )}
          </div>

          <div className={styles.sendSlot}>
            <SimpleTooltip title={tooltip}>
              <Button
                aria-label={actionLabel}
                className={styles.sendButton}
                data-error={isRetry}
                data-expanded={expanded}
                data-hover-expanded={isHoverExpanded}
                data-testid={isRetry ? 'voice-message-retry' : 'voice-message-send'}
                disabled={sendDisabled}
                ref={sendButtonRef}
                size="compact"
                type="button"
                variant="ghost"
                onClick={onAction}
                onPointerEnter={(event) => handlePointerEnter(event.pointerType)}
                onPointerLeave={(event) => handlePointerLeave(event.pointerType)}
              >
                <span className={styles.sendPaint}>
                  <span className={styles.sendLabel}>
                    <SendDots />
                    <span className={styles.sendText}>{actionText}</span>
                    <SendDots />
                  </span>
                  <span className={styles.sendArrow}>
                    <span className="anticon" role="img">
                      {createElement(isRetry ? RotateCcw : ArrowUp, {
                        size: 16,
                        width: 16,
                        height: 16,
                        fill: 'transparent',
                      })}
                    </span>
                  </span>
                </span>
              </Button>
            </SimpleTooltip>
          </div>
        </div>
      </div>
    );
  },
);

VoiceMessageControl.displayName = 'VoiceMessageControl';

const VoiceMessage = memo(() => {
  const actionBarContext = useActionBarContext();
  // Scope compact work sizing to these audio actions without changing permission behavior.
  const audioActionContext = {
    ...actionBarContext,
    actionSize: { blockSize: 32, size: 16 },
  };
  const { t } = useTranslation('chat');
  const agentId = useAgentId();
  const { model, provider } = useEffectiveModel(agentId);
  const fallbackCanRecordVoiceMessage = useVoiceMessageCapability(model, provider, agentId);
  const storeApi = useStoreApi();
  const [
    activeAudioInputMode,
    injectedCanRecordVoiceMessage,
    onVoiceMessageSend,
    sendButtonProps,
    setActiveAudioInputMode,
  ] = useChatInputStore((s) => [
    s.activeAudioInputMode,
    s.canRecordVoiceMessage,
    s.onVoiceMessageSend,
    s.sendButtonProps,
    s.setActiveAudioInputMode,
  ]);
  const canRecordVoiceMessage = injectedCanRecordVoiceMessage ?? fallbackCanRecordVoiceMessage;
  const isGenerating = Boolean(sendButtonProps?.generating);
  const canUseVoiceMessage = canRecordVoiceMessage && !isGenerating;
  const recorder = useVoiceMessageRecorder();
  const canUseVoiceMessageRef = useRef(canUseVoiceMessage);
  canUseVoiceMessageRef.current = canUseVoiceMessage;
  const sendCommittedRef = useRef(false);

  const hasRecorderActivity = recorder.status !== 'idle';
  const isActive = activeAudioInputMode === 'voiceMessage' || hasRecorderActivity;
  const isOtherAudioModeActive =
    activeAudioInputMode !== undefined && activeAudioInputMode !== 'voiceMessage';
  const idleState = getVoiceMessageIdleState({
    canRecordVoiceMessage,
    hasSendHandler: Boolean(onVoiceMessageSend),
    isGenerating,
    isOtherAudioModeActive,
  });
  const canStart = idleState.canStart;

  useEffect(() => {
    if (hasRecorderActivity && activeAudioInputMode !== 'voiceMessage') {
      setActiveAudioInputMode('voiceMessage');
    } else if (!hasRecorderActivity && activeAudioInputMode === 'voiceMessage') {
      setActiveAudioInputMode(undefined);
    }
  }, [activeAudioInputMode, hasRecorderActivity, setActiveAudioInputMode]);

  useEffect(
    () => () => {
      if (storeApi.getState().activeAudioInputMode === 'voiceMessage') {
        storeApi.getState().setActiveAudioInputMode(undefined);
      }
    },
    [storeApi],
  );

  const discard = useCallback(() => {
    recorder.reset();
    setActiveAudioInputMode(undefined);
  }, [recorder, setActiveAudioInputMode]);

  useEffect(() => {
    if (isGenerating && isActive) discard();
  }, [discard, isActive, isGenerating]);

  const commitRecording = useCallback(
    async (captured?: VoiceMessageRecording) => {
      if (!canUseVoiceMessageRef.current || sendCommittedRef.current) return;
      sendCommittedRef.current = true;

      try {
        const voiceRecording = captured ?? recorder.recording ?? (await recorder.stop());
        if (
          !canUseVoiceMessageRef.current ||
          !voiceRecording ||
          voiceRecording.durationMs < recorder.minDurationMs
        )
          return;
        if (!onVoiceMessageSend) return;

        const accepted = onVoiceMessageSend(voiceRecording);
        if (!accepted) return;

        recorder.reset();
        setActiveAudioInputMode(undefined);
      } finally {
        sendCommittedRef.current = false;
      }
    },
    [onVoiceMessageSend, recorder, setActiveAudioInputMode],
  );

  const handleStart = useCallback(() => {
    if (!canStart || storeApi.getState().sendButtonProps?.generating) return;
    setActiveAudioInputMode('voiceMessage');
    void recorder.start();
  }, [canStart, recorder, setActiveAudioInputMode, storeApi]);

  const handleRetryPermission = useCallback(() => {
    if (!canUseVoiceMessageRef.current) return;

    recorder.reset();
    void recorder.start();
  }, [recorder]);

  if (!isActive) {
    if (idleState.hidden) return null;

    const disabledReason = isOtherAudioModeActive
      ? t('voiceMessage.otherAudioModeActive')
      : t('voiceMessage.replyInProgress');

    return (
      <ActionBarContext value={audioActionContext}>
        {canStart ? (
          <span className={styles.actionSlot}>
            <ChatInputAction
              aria-label={t('voiceMessage.action')}
              className={styles.action}
              data-testid="voice-message-action"
              icon={<VoiceMessageIcon size={16} />}
              style={{ borderRadius: 'var(--radius-button)' }}
              title={t('voiceMessage.action')}
              onClick={handleStart}
            />
          </span>
        ) : (
          <SimpleTooltip title={disabledReason}>
            <span className={styles.actionSlot}>
              <ChatInputAction
                disabled
                aria-label={t('voiceMessage.action')}
                className={styles.action}
                data-testid="voice-message-action"
                icon={<VoiceMessageIcon size={16} />}
                showTooltip={false}
                style={{ borderRadius: 'var(--radius-button)' }}
                title={t('voiceMessage.action')}
              />
            </span>
          </SimpleTooltip>
        )}
      </ActionBarContext>
    );
  }

  const errorText = isGenerating
    ? t('voiceMessage.replyInProgress')
    : !canRecordVoiceMessage
      ? t('voiceMessage.unsupported')
      : recorder.error
        ? t(`voiceMessage.error.${recorder.error}`)
        : undefined;
  const waveform = recorder.recording?.waveform ?? recorder.waveform;
  const visibleWaveform = waveform.slice(-8);
  const canSendRecording =
    recorder.durationMs >= recorder.minDurationMs &&
    (recorder.status === 'recording' || recorder.status === 'ready');
  const { canSend, sendDisabled, showRetry } = getVoiceMessageActionState({
    canRecordVoiceMessage: canUseVoiceMessage,
    canSendRecording,
    hasRecoverableError: recorder.status === 'error',
  });
  const showBusy = recorder.status === 'requesting' || recorder.status === 'stopping';
  const statusText =
    recorder.status === 'requesting'
      ? t('voiceMessage.requesting')
      : recorder.status === 'stopping'
        ? t('voiceMessage.stopping')
        : undefined;
  const statusAnnouncement =
    errorText ??
    statusText ??
    (recorder.status === 'recording'
      ? t('voiceMessage.recording')
      : recorder.status === 'ready'
        ? t('voiceMessage.ready')
        : '');

  return (
    <VoiceMessageControl
      actionLabel={t(showRetry ? 'voiceMessage.retry' : 'voiceMessage.send')}
      cancelLabel={t(recorder.status === 'ready' ? 'voiceMessage.delete' : 'voiceMessage.cancel')}
      errorText={errorText}
      expanded={showBusy}
      groupLabel={t('voiceMessage.statusLabel')}
      isRetry={showRetry}
      sendDisabled={sendDisabled}
      statusAnnouncement={statusAnnouncement}
      waveform={visibleWaveform}
      actionText={
        showRetry ? t('input.inputCompletionError.retry') : showBusy ? statusText : t('input.send')
      }
      durationLabel={t('voiceMessage.duration', {
        duration: formatVoiceDuration(recorder.durationMs),
      })}
      tooltip={
        canUseVoiceMessage && !canSend && recorder.status === 'recording'
          ? t('voiceMessage.tooShort', { duration: recorder.minDurationMs })
          : undefined
      }
      onAction={showRetry ? handleRetryPermission : () => void commitRecording()}
      onCancel={discard}
    />
  );
});

VoiceMessage.displayName = 'VoiceMessage';

export default VoiceMessage;
