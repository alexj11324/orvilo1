import { useRef, useState } from 'react';

import type { WriteOutcome } from './types';

export type ReviewSubmitEvent = 'APPROVE' | 'COMMENT' | 'REQUEST_CHANGES';

interface ReviewComposerState {
  body: string;
  open: boolean;
  reviewId: string;
  submitting: ReviewSubmitEvent | null;
  unknownIntent: { body: string; event: ReviewSubmitEvent } | null;
  verifying: boolean;
}

export interface ReviewComposerController extends Omit<ReviewComposerState, 'reviewId'> {
  busy: boolean;
  setBody: (body: string) => void;
  setOpen: (open: boolean) => void;
  submit: (event: ReviewSubmitEvent, body: string) => Promise<void>;
  verifyAndRetry: () => Promise<void>;
}

const emptyState = (reviewId: string): ReviewComposerState => ({
  body: '',
  open: false,
  reviewId,
  submitting: null,
  unknownIntent: null,
  verifying: false,
});

/** Keeps an unfinished review and unknown-outcome recovery across composer visibility changes. */
export const useReviewComposer = (
  reviewId: string,
  onSubmit: (event: ReviewSubmitEvent, body: string) => Promise<WriteOutcome>,
  onVerify?: () => Promise<void>,
): ReviewComposerController => {
  const [state, setState] = useState(() => emptyState(reviewId));
  const currentReviewId = useRef(reviewId);
  currentReviewId.current = reviewId;
  const active = state.reviewId === reviewId ? state : emptyState(reviewId);

  const update = (change: (current: ReviewComposerState) => ReviewComposerState) =>
    setState((current) => change(current.reviewId === reviewId ? current : emptyState(reviewId)));
  const updateIfCurrent = (change: (current: ReviewComposerState) => ReviewComposerState) =>
    setState((current) => (current.reviewId === reviewId ? change(current) : current));

  const submit = async (event: ReviewSubmitEvent, body: string) => {
    if (currentReviewId.current !== reviewId) return;
    update((current) => ({ ...current, submitting: event }));
    try {
      const outcome = await onSubmit(event, body);
      if (currentReviewId.current !== reviewId) return;
      updateIfCurrent((current) => ({
        ...current,
        body: outcome === 'applied' ? '' : current.body,
        unknownIntent:
          outcome === 'applied'
            ? null
            : outcome === 'unknown'
              ? { body, event }
              : current.unknownIntent,
      }));
    } finally {
      updateIfCurrent((current) => ({ ...current, submitting: null }));
    }
  };

  const verifyAndRetry = async () => {
    const intent = active.unknownIntent;
    if (!intent || currentReviewId.current !== reviewId) return;
    update((current) => ({ ...current, verifying: true }));
    try {
      await onVerify?.();
      if (currentReviewId.current === reviewId) await submit(intent.event, intent.body);
    } finally {
      updateIfCurrent((current) => ({ ...current, verifying: false }));
    }
  };

  return {
    ...active,
    busy: active.submitting !== null || active.verifying,
    setBody: (body) => update((current) => ({ ...current, body })),
    setOpen: (open) => update((current) => ({ ...current, open })),
    submit,
    verifyAndRetry,
  };
};
