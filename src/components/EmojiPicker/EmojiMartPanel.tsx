'use client';

import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';
import chroma from 'chroma-js';
import { type CSSProperties, memo, useState } from 'react';

import { useIsDark } from '@/hooks/useIsDark';

interface EmojiMartPanelProps {
  locale: string;
  navPosition: 'bottom' | 'top';
  onSelect: (emoji: string) => void;
}

const toRgb = (value: string, fallback: string) => {
  try {
    return chroma(value).rgb().join(', ');
  } catch {
    return fallback;
  }
};

/** emoji-mart takes its accent and surface as `r, g, b` triples, so read the theme roles once. */
const readPickerColors = (): CSSProperties => {
  if (typeof document === 'undefined') return {};
  const root = getComputedStyle(document.documentElement);
  return {
    '--emoji-picker-rgb-accent': toRgb(root.getPropertyValue('--primary').trim(), '0, 0, 0'),
    '--emoji-picker-rgb-background': toRgb(
      root.getPropertyValue('--popover').trim(),
      '255, 255, 255',
    ),
  } as CSSProperties;
};

/**
 * The emoji-mart grid. It carries the ~600 KB emoji dataset, so the picker
 * loads this module only when its popover opens.
 */
const EmojiMartPanel = memo<EmojiMartPanelProps>(({ locale, navPosition, onSelect }) => {
  const isDark = useIsDark();
  const [colors] = useState(readPickerColors);

  return (
    <div
      className="relative [&_em-emoji-picker]:[--border-radius:0] [&_em-emoji-picker]:[--rgb-accent:var(--emoji-picker-rgb-accent)] [&_em-emoji-picker]:[--rgb-background:var(--emoji-picker-rgb-background)] [&_em-emoji-picker]:[--shadow:none]"
      style={colors}
    >
      <Picker
        data={data}
        icons="outline"
        locale={locale.split('-')[0]}
        navPosition={navPosition}
        previewPosition="none"
        skinTonePosition="none"
        theme={isDark ? 'dark' : 'light'}
        onEmojiSelect={(emoji: { native?: string; src?: string }) =>
          onSelect(emoji.src || emoji.native || '')
        }
      />
    </div>
  );
});
EmojiMartPanel.displayName = 'EmojiMartPanel';

export default EmojiMartPanel;
