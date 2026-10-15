'use client';

import Picker from '@emoji-mart/react';
import { type ComponentProps, useEffect, useRef } from 'react';

import { useResolvedDocumentTheme } from '@/styles/resolvedThemeRoles';

import { bindEmojiPickerTheme, emojiRgbChannels } from './shadowTheme';

export default function ThemedEmojiPicker(props: ComponentProps<typeof Picker>) {
  const theme = useResolvedDocumentTheme();
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!container.current) return;
    return bindEmojiPickerTheme(
      container.current,
      {
        '--rgb-accent': emojiRgbChannels(theme.colorPrimary),
        '--rgb-background': emojiRgbChannels(theme.colorBgElevated),
        '--rgb-input': emojiRgbChannels(theme.colorBgContainer),
        '--color-border': theme.colorBorderSecondary,
        '--color-border-over': theme.colorBorder,
        '--border-radius': '0',
        '--shadow': 'none',
        '--lobe-font-family': theme.fontFamily,
        '--orvilo-emoji-text': theme.colorText,
        '--orvilo-emoji-text-secondary': theme.colorTextSecondary,
        '--orvilo-emoji-text-tertiary': theme.colorTextTertiary,
        '--orvilo-emoji-duration-mid': theme.motionDurationMid,
        '--orvilo-emoji-duration-fast': theme.motionDurationFast,
        '--orvilo-emoji-ease-out': theme.motionEaseOut,
      },
      theme.motion !== false,
    );
  }, [
    theme.colorPrimary,
    theme.colorBgElevated,
    theme.colorBgContainer,
    theme.colorBorderSecondary,
    theme.colorBorder,
    theme.fontFamily,
    theme.colorText,
    theme.colorTextSecondary,
    theme.colorTextTertiary,
    theme.motionDurationMid,
    theme.motionDurationFast,
    theme.motionEaseOut,
    theme.motion,
  ]);
  return (
    <div ref={container}>
      <Picker {...props} />
    </div>
  );
}
