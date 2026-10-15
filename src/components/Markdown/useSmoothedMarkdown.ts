'use client';

import { useEffect, useRef, useState } from 'react';

export type StreamAnimationGranularity = 'char' | 'word';
export type StreamSmoothingPreset = 'realtime' | 'balanced' | 'silky';

/** At most a short frame backlog; settled content and non-prefix edits are immediate. */
export function useSmoothedMarkdown(
  content: string,
  active: boolean,
  granularity: StreamAnimationGranularity,
  preset: StreamSmoothingPreset,
) {
  const [visible, setVisible] = useState(content);
  const current = useRef(content);
  useEffect(() => {
    if (!active || !content.startsWith(current.current)) {
      current.current = content;
      setVisible(content);
      return;
    }
    let frame: number | undefined;
    let previous = performance.now();
    const duration = preset === 'realtime' ? 16 : preset === 'silky' ? 160 : 100;
    const reveal = (now: number) => {
      const backlog = content.length - current.current.length;
      const progress = Math.max(1, Math.ceil(backlog * Math.min(1, (now - previous) / duration)));
      let end = Math.min(content.length, current.current.length + progress);
      if (granularity === 'word' && end < content.length) {
        const boundary = content.slice(end).search(/\s/);
        if (boundary >= 0) end += boundary + 1;
      }
      // Do not expose half a UTF-16 surrogate pair.
      if (end < content.length && /[\uD800-\uDBFF]/.test(content[end - 1])) end++;
      current.current = content.slice(0, end);
      setVisible(current.current);
      previous = now;
      if (end < content.length) frame = requestAnimationFrame(reveal);
    };
    if (current.current.length < content.length) frame = requestAnimationFrame(reveal);
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [content, active, granularity, preset]);
  return !active || !content.startsWith(visible) ? content : visible;
}
