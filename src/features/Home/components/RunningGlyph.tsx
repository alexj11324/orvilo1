import { memo } from 'react';

import RingLoadingIcon from '@/components/RingLoading';

/**
 * The ring track is a translucent wash of the same warning color, so the
 * spinner reads as one glyph rather than a colored arc on a grey donut.
 */
const RING_COLOR = `color-mix(in srgb, ${'var(--warning)'} 45%, transparent)`;

/** One "this is executing right now" mark, shared by every home surface that shows it. */
const RunningGlyph = memo<{ size?: number }>(({ size = 16 }) => (
  <RingLoadingIcon ringColor={RING_COLOR} size={size} style={{ color: 'var(--warning)' }} />
));

export default RunningGlyph;
