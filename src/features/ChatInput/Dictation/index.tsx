'use client';

import { cn } from 'cn';
import { Mic, RotateCcw, X } from 'lucide-react';
import type { MouseEvent } from 'react';
import { memo, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { Spinner } from '@/components/ui/spinner';
import { useServerConfigStore } from '@/store/serverConfig';

import { ChatInputAction } from '../ActionBar/components/ChatInputAction';
import { ActionBarContext, useActionBarContext } from '../ActionBar/context';
import { SimpleTooltip } from '../SimpleTooltip';
import { useChatInputStore, useStoreApi } from '../store';
import { isOtherAudioInputModeActive } from './mutualExclusion';
import { getDictationControlMode } from './presentation';
import { useDictationControlFocus } from './useDictationControlFocus';
import { useRealtimeDictation } from './useRealtimeDictation';

const styles = {
  // ActionIcon has a 1px border: its 30px padding box plus 7px on each side is 44px.
  action:
    "relative active:not-aria-[haspopup]:translate-y-0 pointer-coarse:after:absolute pointer-coarse:after:-inset-[calc(var(--spacing)*1.75)] pointer-coarse:after:content-['']",
  actionSlot: 'inline-flex size-8 flex-none items-center justify-center pointer-coarse:size-11',
  cancel: 'text-muted-foreground',
  controlRow: 'flex flex-none items-center gap-1',
  controls: 'flex flex-none items-center gap-1 rounded-full bg-selected p-0.5',
  listening:
    'bg-primary text-primary-foreground transition-[color,background-color] duration-(--orvilo-motion-mid) ease-in-out hover:bg-primary-hover hover:text-primary-hover-foreground active:bg-(--ant-color-primary-active) active:text-[contrast-color(var(--ant-color-primary-active))] focus-visible:ring-0 focus-visible:shadow-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-current focus-visible:-outline-offset-3 motion-reduce:transition-none',
  listeningStatus: 'sr-only',
  spin: 'inline-flex',
  status:
    'max-w-40 overflow-hidden [padding-inline:--spacing(1.5)_--spacing(0.5)] text-xs text-muted-foreground text-ellipsis whitespace-nowrap',
};
const Dictation = memo(() => {
  const actionBarContext = useActionBarContext();
  // Scope compact work sizing to these audio actions without changing permission behavior.
  const audioActionContext = {
    ...actionBarContext,
    actionSize: { blockSize: 32, size: 16 },
  };
  const { t } = useTranslation('chat');
  const enabled = useServerConfigStore((s) => s.featureFlags.enableVoiceDictation === true);
  const storeApi = useStoreApi();
  const [activeAudioInputMode, editor, mobile, generating, setActiveAudioInputMode] =
    useChatInputStore((s) => [
      s.activeAudioInputMode,
      s.editor,
      s.mobile,
      Boolean(s.sendButtonProps?.generating),
      s.setActiveAudioInputMode,
    ]);
  const { client, errorCode, retryable, status } = useRealtimeDictation(editor);
  const active = status !== 'idle' || activeAudioInputMode === 'dictation';
  const controlMode = getDictationControlMode(status);
  const otherAudioModeActive = isOtherAudioInputModeActive(activeAudioInputMode, 'dictation');
  const {
    actionRef,
    cancelRef,
    handleKeyboardActivation,
    preserveFocusOnActivation,
    retryRef,
    stopRef,
  } = useDictationControlFocus({ active, retryable, status });

  useEffect(() => {
    if (!client) return;
    if (status !== 'idle' && activeAudioInputMode !== 'dictation') {
      setActiveAudioInputMode('dictation');
    } else if (status === 'idle' && activeAudioInputMode === 'dictation') {
      setActiveAudioInputMode(undefined);
    }
  }, [activeAudioInputMode, client, setActiveAudioInputMode, status]);

  useEffect(
    () => () => {
      if (storeApi.getState().activeAudioInputMode === 'dictation') {
        storeApi.getState().setActiveAudioInputMode(undefined);
      }
    },
    [storeApi],
  );

  useEffect(() => {
    if (generating && active) void client?.cancel('audio_interruption');
  }, [active, client, generating]);

  useEffect(() => {
    if ((!enabled || mobile) && activeAudioInputMode === 'dictation') {
      void client?.dispose();
      setActiveAudioInputMode(undefined);
    }
  }, [activeAudioInputMode, client, enabled, mobile, setActiveAudioInputMode]);

  const start = useCallback(() => {
    if (!client || generating || otherAudioModeActive) return;
    setActiveAudioInputMode('dictation');
    void client.start();
  }, [client, generating, otherAudioModeActive, setActiveAudioInputMode]);

  const dismiss = useCallback(() => {
    void client?.dispose();
    setActiveAudioInputMode(undefined);
  }, [client, setActiveAudioInputMode]);

  const handleStart = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      preserveFocusOnActivation(event);
      start();
    },
    [preserveFocusOnActivation, start],
  );

  const handleStop = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      preserveFocusOnActivation(event);
      void client?.stop();
    },
    [client, preserveFocusOnActivation],
  );

  const handleCancel = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      preserveFocusOnActivation(event);
      void client?.cancel();
    },
    [client, preserveFocusOnActivation],
  );

  const handleDismiss = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      preserveFocusOnActivation(event);
      dismiss();
    },
    [dismiss, preserveFocusOnActivation],
  );

  if (!enabled || mobile || !client) return null;

  if (!active) {
    const disabled = generating || otherAudioModeActive;
    const title = generating
      ? t('voiceDictation.replyInProgress')
      : otherAudioModeActive
        ? t('voiceDictation.otherAudioModeActive')
        : t('voiceDictation.action');

    return (
      <ActionBarContext value={audioActionContext}>
        {disabled ? (
          <SimpleTooltip title={title}>
            <span className={styles.actionSlot}>
              <ChatInputAction
                disabled
                aria-label={t('voiceDictation.action')}
                className={styles.action}
                data-testid="voice-dictation-action"
                icon={Mic}
                ref={actionRef}
                showTooltip={false}
                style={{ borderRadius: 'var(--radius-button)' }}
                title={title}
              />
            </span>
          </SimpleTooltip>
        ) : (
          <span className={styles.actionSlot}>
            <ChatInputAction
              aria-label={t('voiceDictation.action')}
              className={styles.action}
              data-testid="voice-dictation-action"
              icon={Mic}
              ref={actionRef}
              style={{ borderRadius: 'var(--radius-button)' }}
              title={t('voiceDictation.action')}
              onClick={handleStart}
              onKeyDown={(event) => handleKeyboardActivation(event, start)}
            />
          </span>
        )}
      </ActionBarContext>
    );
  }

  const errorText = errorCode ? t(`voiceDictation.error.${errorCode}`) : undefined;
  const statusText =
    status === 'requesting_permission'
      ? t('voiceDictation.requestingPermission')
      : status === 'connecting'
        ? t('voiceDictation.connecting')
        : status === 'listening'
          ? t('voiceDictation.listening')
          : status === 'finalizing'
            ? t('voiceDictation.finalizing')
            : errorText;

  if (controlMode === 'listening') {
    return (
      <ActionBarContext value={audioActionContext}>
        <div
          aria-label={t('voiceDictation.statusLabel')}
          className={styles.controlRow}
          data-status="listening"
          data-testid="voice-dictation-controls"
          role="group"
        >
          <span aria-live="polite" className={styles.listeningStatus} role="status">
            {statusText}
          </span>
          <span className={styles.actionSlot}>
            <ChatInputAction
              aria-label={t('voiceDictation.stop')}
              className={cn(styles.action, styles.listening)}
              data-testid="voice-dictation-stop"
              icon={Mic}
              ref={stopRef}
              style={{ borderRadius: 'var(--radius-button)' }}
              title={t('voiceDictation.stop')}
              onClick={handleStop}
              onKeyDown={(event) =>
                handleKeyboardActivation(event, () => {
                  void client?.stop();
                })
              }
            />
          </span>
          <span className={styles.actionSlot}>
            <ChatInputAction
              aria-label={t('voiceDictation.cancel')}
              className={cn(styles.action, styles.cancel)}
              data-testid="voice-dictation-cancel"
              icon={X}
              ref={cancelRef}
              style={{ borderRadius: 'var(--radius-button)' }}
              title={t('voiceDictation.cancel')}
              onClick={handleCancel}
              onKeyDown={(event) =>
                handleKeyboardActivation(event, () => {
                  void client?.cancel();
                })
              }
            />
          </span>
        </div>
      </ActionBarContext>
    );
  }

  return (
    <ActionBarContext value={audioActionContext}>
      <div
        aria-label={t('voiceDictation.statusLabel')}
        className={styles.controlRow}
        data-status={status}
        data-testid="voice-dictation-controls"
        role="group"
      >
        <div className={styles.controls}>
          <span aria-live="polite" className={styles.status} role="status">
            {statusText}
          </span>
          {status === 'error' && retryable ? (
            <span className={styles.actionSlot}>
              <ChatInputAction
                aria-label={t('voiceDictation.retry')}
                className={styles.action}
                data-testid="voice-dictation-retry"
                icon={RotateCcw}
                ref={retryRef}
                style={{ borderRadius: 'var(--radius-button)' }}
                title={t('voiceDictation.retry')}
                onClick={handleStart}
                onKeyDown={(event) => handleKeyboardActivation(event, start)}
              />
            </span>
          ) : status !== 'error' ? (
            <span aria-hidden className={cn('anticon', styles.spin)} role="img">
              <Spinner aria-hidden className="size-4" fill="transparent" role="presentation" />
            </span>
          ) : null}
        </div>
        <span className={styles.actionSlot}>
          <ChatInputAction
            className={cn(styles.action, styles.cancel)}
            data-testid="voice-dictation-cancel"
            icon={X}
            ref={cancelRef}
            style={{ borderRadius: 'var(--radius-button)' }}
            title={status === 'error' ? t('voiceDictation.dismiss') : t('voiceDictation.cancel')}
            aria-label={
              status === 'error' ? t('voiceDictation.dismiss') : t('voiceDictation.cancel')
            }
            onClick={status === 'error' ? handleDismiss : handleCancel}
            onKeyDown={(event) =>
              handleKeyboardActivation(event, () => {
                if (status === 'error') {
                  dismiss();
                  return;
                }

                void client?.cancel();
              })
            }
          />
        </span>
      </div>
    </ActionBarContext>
  );
});

Dictation.displayName = 'Dictation';

export default Dictation;
