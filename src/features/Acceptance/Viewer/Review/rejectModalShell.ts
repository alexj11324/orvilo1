import { cn } from 'cn';

import { frostedModalStyles } from './modals';
import nativeStyles from './rejectModalShell.module.css';

export const CHECK_REJECT_MODAL_SIZE = { height: '98dvh', width: '98vw' } as const;
export const TEXT_REJECT_MODAL_WIDTH = 'min(560px, calc(100vw - 32px))';

/**
 * The modal chrome, not its contents. These classes ride on the popup element
 * that `createModal` owns, so they stay media-query driven: the shell has to
 * answer for both breakpoints in one node, unlike the body, which mounts one
 * presentation or the other.
 */

const styles = {
  mobileClose: nativeStyles.close,
  mobileContent:
    '[@media(width<=767px)]:px-3 [@media(width<=767px)]:pbs-0 [@media(width<=767px)]:[padding-block-end:max(12px,env(safe-area-inset-bottom))]',
  mobileHeader:
    '[@media(width<=767px)]:min-h-14 [@media(width<=767px)]:ps-3 [@media(width<=767px)]:pe-13 [@media(width<=767px)]:[padding-block-start:max(12px,env(safe-area-inset-top))] [@media(width<=767px)]:pbe-3',
  mobilePopup: nativeStyles.popup,
  modalPopup: 'flex flex-col',
  modalPopupMedia: nativeStyles.mediaPopup,
} as const;

/** Evidence earns a near-fullscreen stage; a text-only reject stays a dialog. */
export const checkRejectModalSize = (evidenceCount: number) =>
  evidenceCount > 0
    ? CHECK_REJECT_MODAL_SIZE
    : ({ height: 'auto', width: TEXT_REJECT_MODAL_WIDTH } as const);

export const checkRejectModalShell = (evidenceCount: number) => {
  const modalSize = checkRejectModalSize(evidenceCount);
  return {
    classNames: {
      close: styles.mobileClose,
      content: styles.mobileContent,
      header: styles.mobileHeader,
      popup: cn(styles.modalPopup, styles.mobilePopup, evidenceCount > 0 && styles.modalPopupMedia),
    },
    styles: {
      ...frostedModalStyles,
      // Public styles slots follow the primitive defaults, including its inline
      // maxWidth and close size. Owned media variables need no importance.
      close: {
        height: 'var(--acceptance-reject-close-size)',
        insetBlockStart: 'var(--acceptance-reject-close-block-start)',
        insetInlineEnd: 'var(--acceptance-reject-close-inline-end)',
        width: 'var(--acceptance-reject-close-size)',
      },
      popup: {
        borderRadius: 'var(--acceptance-reject-popup-radius)',
        height: 'var(--acceptance-reject-popup-height)',
        maxHeight: 'var(--acceptance-reject-popup-max-height)',
        maxWidth: 'var(--acceptance-reject-popup-width)',
        width: 'var(--acceptance-reject-popup-width)',
      },
      content: { display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' },
    },
    width: modalSize.width,
  };
};

export const rejectModalTitle = (title: string, description?: string) => ({
  description: description?.trim() || undefined,
  title,
});

export const canDismissRejectModal = (loading: boolean) => !loading;
