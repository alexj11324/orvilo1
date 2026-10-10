import { Check, CheckCheck, CircleDashed, HelpCircle, MessageSquareX, XCircle } from 'lucide-react';

import { userReviewState } from './checkState';
import type { AcceptanceCheck, AcceptanceCheckState } from './types';

export const STATE_META: Record<AcceptanceCheckState, { color: string; icon: typeof Check }> = {
  failed: { color: 'var(--destructive)', icon: XCircle },
  not_executed: { color: 'var(--ant-color-text-quaternary)', icon: CircleDashed },
  passed: { color: 'var(--success)', icon: Check },
  uncertain: { color: 'var(--warning)', icon: HelpCircle },
};

/** Canonical verdict glyph for every surface that presents an Acceptance check. */
export const checkHeadMeta = (check: AcceptanceCheck) => {
  const meta = STATE_META[check.state];
  const reviewState = userReviewState(check);

  if (reviewState === 'rejected') {
    return { color: 'var(--destructive)', icon: MessageSquareX };
  }

  if (check.state === 'passed' && reviewState === 'accepted') {
    return { color: 'var(--success)', icon: CheckCheck };
  }

  return meta;
};
