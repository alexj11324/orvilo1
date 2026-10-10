'use client';

import { cn } from 'cn';
import { memo, useRef, useState } from 'react';

import { MinimapIndicator } from './MinimapIndicator';
import { MinimapPreview } from './MinimapPreview';
import { minimapStyles } from './styles';
import { useMinimapData } from './useMinimapData';
import { MIN_MESSAGES_THRESHOLD } from './utils';

const CLOSE_DELAY_MS = 120;

const ChatMinimap = memo(() => {
  const styles = minimapStyles;
  const [hovered, setHovered] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { indicators, activeIndicatorPosition, handleJump } = useMinimapData();

  if (indicators.length <= MIN_MESSAGES_THRESHOLD) return null;

  const handleEnter = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setHovered(true);
  };

  const handleLeave = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      setHovered(false);
      closeTimerRef.current = null;
    }, CLOSE_DELAY_MS);
  };

  const handleJumpAndClose = (virtuosoIndex: number) => {
    handleJump(virtuosoIndex);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    setHovered(false);
  };

  return (
    <div className={cn(styles.container, 'flex flex-col')}>
      <div
        className={cn(styles.hoverArea, 'flex flex-col')}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        <div
          className={cn(styles.rail, 'flex flex-col', hovered && 'pointer-events-none opacity-0')}
          role={'group'}
        >
          {indicators.map(({ id, width, virtuosoIndex }, position) => (
            <MinimapIndicator
              activePosition={activeIndicatorPosition}
              id={id}
              key={id}
              position={position}
              virtuosoIndex={virtuosoIndex}
              width={width}
              onJump={handleJump}
            />
          ))}
        </div>
        <div
          aria-hidden={!hovered}
          className={cn(
            styles.previewPanel,
            hovered
              ? 'pointer-events-auto opacity-100 [transform:translateY(-50%)_scale(1)]'
              : 'pointer-events-none opacity-0 [transform:translateY(-50%)_scale(0.96)]',
          )}
        >
          <MinimapPreview
            activePosition={activeIndicatorPosition}
            indicators={indicators}
            onJump={handleJumpAndClose}
          />
        </div>
      </div>
    </div>
  );
});

ChatMinimap.displayName = 'ChatMinimap';

export default ChatMinimap;
