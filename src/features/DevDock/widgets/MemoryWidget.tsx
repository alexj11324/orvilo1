'use client';

import { cn } from 'cn';
import { memo, useState } from 'react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { DOCK_Z_INDEX } from '../const';
import { barButtonStyles } from './BarButton';
import { formatCompactSize } from './memoryFormat';
import MemoryPopover from './MemoryPopover';
import { isMemorySamplingSupported, useMemorySamples } from './memorySamples';
import { isMemoryHigh } from './metricUtils';

const styles = {
  active: 'text-foreground bg-selected',
  high: 'text-destructive-text',
  mid: 'text-warning-text',
  text: 'font-mono text-xs leading-5 tabular-nums text-foreground-tertiary',
};

const MemoryWidget = memo(() => {
  const samples = useMemorySamples();
  const [open, setOpen] = useState(false);

  if (!isMemorySamplingSupported() || !samples) return null;

  const { jsHeapUsedBytes, jsHeapLimitBytes, renderer } = samples.latest;
  const percent = (jsHeapUsedBytes / jsHeapLimitBytes) * 100;
  const high = isMemoryHigh(percent, renderer?.privateBytes);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type={'button'}
            className={cn(
              barButtonStyles.button,
              styles.text,
              high ? styles.high : percent >= 70 ? styles.mid : undefined,
              open && styles.active,
            )}
            title={
              renderer
                ? 'R = Renderer private footprint (red at 1 GiB) · J = JS heap used — click for the full breakdown'
                : 'J = JS heap used — click for the full breakdown'
            }
          >
            {renderer && `R${formatCompactSize(renderer.privateBytes)} · `}J
            {formatCompactSize(jsHeapUsedBytes)}
          </button>
        }
      />
      <PopoverContent
        align="end"
        className="w-auto p-0"
        side="top"
        sideOffset={6}
        style={{ zIndex: DOCK_Z_INDEX + 1 }}
      >
        <MemoryPopover />
      </PopoverContent>
    </Popover>
  );
});

MemoryWidget.displayName = 'DevDockMemoryWidget';

export default MemoryWidget;
