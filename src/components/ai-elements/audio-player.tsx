'use client';

import type { Experimental_SpeechResult as SpeechResult } from 'ai';
import { cn } from 'cn';
import {
  MediaControlBar,
  MediaController,
  MediaDurationDisplay,
  MediaMuteButton,
  MediaPlayButton,
  MediaSeekBackwardButton,
  MediaSeekForwardButton,
  MediaTimeDisplay,
  MediaTimeRange,
  MediaVolumeRange,
} from 'media-chrome/react';
import type { ComponentProps, CSSProperties } from 'react';

import { buttonVariants } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';

export type AudioPlayerProps = Omit<ComponentProps<typeof MediaController>, 'audio'>;

export const AudioPlayer = ({ children, style, ...props }: AudioPlayerProps) => (
  <MediaController
    audio
    data-slot="audio-player"
    style={
      {
        '--media-background-color': 'transparent',
        '--media-button-icon-height': '1rem',
        '--media-button-icon-width': '1rem',
        '--media-control-background': 'transparent',
        '--media-control-hover-background': 'var(--color-accent)',
        '--media-control-padding': '0px',
        '--media-font': 'var(--font-sans)',
        '--media-font-size': '10px',
        '--media-icon-color': 'currentColor',
        '--media-preview-time-background': 'var(--color-background)',
        '--media-preview-time-border-radius': 'var(--radius-md)',
        '--media-preview-time-text-shadow': 'none',
        '--media-primary-color': 'var(--color-primary)',
        '--media-range-bar-color': 'var(--color-primary)',
        '--media-range-track-background': 'var(--color-secondary)',
        '--media-secondary-color': 'var(--color-secondary)',
        '--media-text-color': 'var(--color-foreground)',
        '--media-tooltip-arrow-display': 'none',
        '--media-tooltip-background': 'var(--color-background)',
        '--media-tooltip-border-radius': 'var(--radius-md)',
        ...style,
      } as CSSProperties
    }
    {...props}
  >
    {children}
  </MediaController>
);

export type AudioPlayerElementProps = Omit<ComponentProps<'audio'>, 'src'> &
  (
    | {
        data: SpeechResult['audio'];
      }
    | {
        src: string;
      }
  );

export const AudioPlayerElement = ({ ...props }: AudioPlayerElementProps) => (
  // oxlint-disable-next-line eslint-plugin-jsx-a11y(media-has-caption) -- audio player captions are provided by consumer
  <audio
    data-slot="audio-player-element"
    slot="media"
    src={'src' in props ? props.src : `data:${props.data.mediaType};base64,${props.data.base64}`}
    {...props}
  />
);

export type AudioPlayerControlBarProps = ComponentProps<typeof MediaControlBar>;

export const AudioPlayerControlBar = ({ children, ...props }: AudioPlayerControlBarProps) => (
  <MediaControlBar data-slot="audio-player-control-bar" {...props}>
    <ButtonGroup className="w-full min-w-0" orientation="horizontal">
      {children}
    </ButtonGroup>
  </MediaControlBar>
);

export type AudioPlayerPlayButtonProps = ComponentProps<typeof MediaPlayButton>;

export const AudioPlayerPlayButton = ({ className, ...props }: AudioPlayerPlayButtonProps) => (
  <MediaPlayButton
    className={cn(buttonVariants({ size: 'icon-sm', variant: 'outline' }), className)}
    data-slot="audio-player-play-button"
    {...props}
  />
);

export type AudioPlayerSeekBackwardButtonProps = ComponentProps<typeof MediaSeekBackwardButton>;

export const AudioPlayerSeekBackwardButton = ({
  seekOffset = 10,
  ...props
}: AudioPlayerSeekBackwardButtonProps) => (
  <MediaSeekBackwardButton
    className={buttonVariants({ size: 'icon-sm', variant: 'outline' })}
    data-slot="audio-player-seek-backward-button"
    seekOffset={seekOffset}
    {...props}
  />
);

export type AudioPlayerSeekForwardButtonProps = ComponentProps<typeof MediaSeekForwardButton>;

export const AudioPlayerSeekForwardButton = ({
  seekOffset = 10,
  ...props
}: AudioPlayerSeekForwardButtonProps) => (
  <MediaSeekForwardButton
    className={buttonVariants({ size: 'icon-sm', variant: 'outline' })}
    data-slot="audio-player-seek-forward-button"
    seekOffset={seekOffset}
    {...props}
  />
);

export type AudioPlayerTimeDisplayProps = ComponentProps<typeof MediaTimeDisplay>;

export const AudioPlayerTimeDisplay = ({ className, ...props }: AudioPlayerTimeDisplayProps) => (
  <div className="flex flex-none items-center rounded-lg border px-2">
    <MediaTimeDisplay
      className={cn('tabular-nums', className)}
      data-slot="audio-player-time-display"
      {...props}
    />
  </div>
);

export type AudioPlayerTimeRangeProps = ComponentProps<typeof MediaTimeRange>;

export const AudioPlayerTimeRange = ({ className, ...props }: AudioPlayerTimeRangeProps) => (
  <div className="flex min-w-0 flex-1 items-center rounded-lg border px-2">
    <MediaTimeRange className={cn('', className)} data-slot="audio-player-time-range" {...props} />
  </div>
);

export type AudioPlayerDurationDisplayProps = ComponentProps<typeof MediaDurationDisplay>;

export const AudioPlayerDurationDisplay = ({
  className,
  ...props
}: AudioPlayerDurationDisplayProps) => (
  <div className="flex flex-none items-center rounded-lg border px-2">
    <MediaDurationDisplay
      className={cn('tabular-nums', className)}
      data-slot="audio-player-duration-display"
      {...props}
    />
  </div>
);

export type AudioPlayerMuteButtonProps = ComponentProps<typeof MediaMuteButton>;

export const AudioPlayerMuteButton = ({ className, ...props }: AudioPlayerMuteButtonProps) => (
  <div className="flex flex-none items-center rounded-lg border px-2">
    <MediaMuteButton
      className={cn('', className)}
      data-slot="audio-player-mute-button"
      {...props}
    />
  </div>
);

export type AudioPlayerVolumeRangeProps = ComponentProps<typeof MediaVolumeRange>;

export const AudioPlayerVolumeRange = ({ className, ...props }: AudioPlayerVolumeRangeProps) => (
  <div className="flex flex-none items-center rounded-lg border px-2">
    <MediaVolumeRange
      className={cn('', className)}
      data-slot="audio-player-volume-range"
      {...props}
    />
  </div>
);
