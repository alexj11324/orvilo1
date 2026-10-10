'use client';

import { memo } from 'react';

import { createModal } from '@/components/Modal';
import { useIsMobile } from '@/hooks/use-mobile';

import { DesktopEvidenceReview } from '../Evidence/DesktopEvidenceReview';
import { MobileEvidenceReview } from '../Evidence/MobileEvidenceReview';
import { checkRejectModalShell, rejectModalTitle } from './rejectModalShell';
import type { RejectReviewInput } from './useRejectReview';
import { useRejectReview } from './useRejectReview';

export type { RejectableEvidence } from './rejectDraft';

interface CheckRejectModalProps extends RejectReviewInput {
  checkDescription?: string;
  checkTitle: string;
}

/**
 * The reject's state lives here; where it goes on screen does not.
 *
 * The phone and the desktop lay this out differently enough to be separate
 * files, but they are the same review: one draft, one set of regions, one
 * submit rule. This is the single place that picks between them.
 */
export const CheckRejectModalContent = memo<CheckRejectModalProps>(
  ({ checkDescription: _checkDescription, checkTitle, ...input }) => {
    const md = !useIsMobile();
    const model = useRejectReview(input);

    return md ? (
      <DesktopEvidenceReview checkTitle={checkTitle} model={model} />
    ) : (
      <MobileEvidenceReview model={model} />
    );
  },
);

CheckRejectModalContent.displayName = 'AcceptanceCheckRejectModalContent';

/** Per-check reject modal — media gets a near-fullscreen annotation surface without losing context. */
export const openCheckRejectModal = (options: CheckRejectModalProps) => {
  const modalTitle = rejectModalTitle(options.checkTitle, options.checkDescription);
  const shell = checkRejectModalShell(options.evidence.length);

  return createModal({
    ...shell,
    content: <CheckRejectModalContent {...options} />,
    footer: null,
    maskClosable: true,
    title: (
      <div className="flex flex-col gap-0.5">
        <div className="font-semibold" style={{ overflowWrap: 'anywhere', whiteSpace: 'normal' }}>
          {modalTitle.title}
        </div>
        {modalTitle.description && (
          <div className="text-[12px] text-muted-foreground">{modalTitle.description}</div>
        )}
      </div>
    ),
  });
};
