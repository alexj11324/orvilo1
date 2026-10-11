import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';

/**
 * Deep link to a feed card: when the URL fragment names `anchorId`, scroll the
 * card into view and report `true` for a moment so the card can ring itself.
 * Shared by comment cards (`#comment-<id>`) and run cards (`#run-<topicId>`).
 */
export const useAnchorHighlight = (anchorId: string | undefined): boolean => {
  const { hash } = useLocation();
  const isTarget = !!anchorId && hash === `#${anchorId}`;
  const [highlighted, setHighlighted] = useState(false);
  useEffect(() => {
    if (!isTarget) return;
    document.getElementById(anchorId!)?.scrollIntoView({ block: 'center' });
    setHighlighted(true);
    const timer = window.setTimeout(() => setHighlighted(false), 2000);
    return () => window.clearTimeout(timer);
  }, [isTarget, anchorId]);
  return highlighted;
};
