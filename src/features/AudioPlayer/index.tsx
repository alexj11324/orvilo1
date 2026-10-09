'use client';

import { cn } from 'cn';
import { DownloadIcon, RotateCcwIcon, XIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  AudioPlayer as Player,
  AudioPlayerControlBar,
  AudioPlayerDurationDisplay,
  AudioPlayerElement,
  AudioPlayerPlayButton,
  AudioPlayerTimeDisplay,
  AudioPlayerTimeRange,
} from '@/components/ai-elements/audio-player';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { VoiceMessageUploadState } from '@/store/chat/slices/voiceMessage/initialState';

import { useAudioElementSource } from './useAudioElementSource';

export const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0')}`;
};

interface AudioPlayerProps {
  alt?: string;
  downloadFileName?: string;
  durationMs?: number;
  fullWidth?: boolean;
  onCancelUpload?: () => void;
  onRetryUpload?: () => void;
  uploadState?: VoiceMessageUploadState;
  url: string;
}

const AudioPlayer = ({
  url,
  alt,
  downloadFileName,
  durationMs,
  fullWidth,
  onCancelUpload,
  onRetryUpload,
  uploadState,
}: AudioPlayerProps) => {
  const { t } = useTranslation('chat');
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [failedUrl, setFailedUrl] = useState<string>();
  useAudioElementSource(audioRef, url);
  const progress = Math.min(100, Math.max(0, Math.round(uploadState?.progress ?? 0)));
  const isFailed = uploadState?.status === 'failed';
  const isPending = uploadState?.status === 'uploading' || uploadState?.status === 'sending';
  const status =
    uploadState?.status === 'uploading'
      ? t('voiceMessage.status.uploading', { progress })
      : uploadState?.status === 'sending'
        ? t('voiceMessage.status.sending')
        : isFailed
          ? t(
              uploadState.error === 'unsupported'
                ? 'voiceMessage.status.unsupported'
                : uploadState.error === 'send'
                  ? 'voiceMessage.status.sendFailed'
                  : 'voiceMessage.status.uploadFailed',
            )
          : undefined;

  const download = async () => {
    if (!downloadFileName) return;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Audio download failed (${response.status})`);
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = downloadFileName;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      console.error('Audio download failed', error);
      window.open(url, '_blank', 'noopener');
    }
  };

  return (
    <div
      data-ai-element="audio-player"
      className={cn(
        'max-w-full space-y-2 rounded-lg border bg-card p-2',
        fullWidth ? 'w-full' : 'w-96',
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Player
          aria-label={alt}
          className="min-w-0 flex-1"
          mediaDuration={durationMs ? durationMs / 1000 : undefined}
        >
          <AudioPlayerElement
            preload="metadata"
            ref={audioRef}
            src={url}
            onCanPlay={() => setFailedUrl(undefined)}
            onEnded={() => setIsPlaying(false)}
            onError={() => setFailedUrl(url)}
            onPause={() => setIsPlaying(false)}
            onPlay={() => setIsPlaying(true)}
          />
          <AudioPlayerControlBar className="w-full">
            <AudioPlayerPlayButton
              aria-label={t(isPlaying ? 'audioPlayer.pause' : 'audioPlayer.play')}
            />
            <AudioPlayerTimeDisplay />
            <AudioPlayerTimeRange aria-label={t('audioPlayer.seek')} className="min-w-12 w-full" />
            <AudioPlayerDurationDisplay />
          </AudioPlayerControlBar>
        </Player>
        {downloadFileName && (
          <Button
            aria-label={t('audioPlayer.download')}
            size="icon-sm"
            variant="ghost"
            onClick={() => void download()}
          >
            <DownloadIcon className="size-4" />
          </Button>
        )}
        {isFailed && (
          <Button
            aria-label={t('voiceMessage.retry')}
            size="icon-sm"
            variant="ghost"
            onClick={onRetryUpload}
          >
            <RotateCcwIcon className="size-4" />
          </Button>
        )}
        {(isPending || isFailed) && (
          <Button
            aria-label={t(isFailed ? 'voiceMessage.delete' : 'voiceMessage.cancelUpload')}
            size="icon-sm"
            variant="ghost"
            onClick={onCancelUpload}
          >
            <XIcon className="size-4" />
          </Button>
        )}
      </div>
      {status && (
        <p className="text-xs text-muted-foreground" role="status">
          {status}
        </p>
      )}
      {uploadState?.status === 'uploading' && <Progress aria-label={status} value={progress} />}
      {failedUrl === url && (
        <p className="text-xs text-destructive-text" role="alert">
          {t('aiElementsMore.audioError')}
        </p>
      )}
    </div>
  );
};

export default AudioPlayer;
