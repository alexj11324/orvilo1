'use client';

import { t } from 'i18next';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ModalInstance } from '@/components/Modal';
import { createModal, useModalContext } from '@/components/Modal';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

import {
  AttachmentStrip,
  AttachmentUploadButton,
  useFeedbackAttachments,
} from '../Evidence/attachments';

const styles = {
  warning: 'rounded-(--ant-border-radius-lg) bg-(--ant-color-warning-bg) px-3.5 py-2.5',
};

/**
 * A frosted scrim for the acceptance decision dialogs — the page behind reads
 * as a soft blur so the dialog owns focus (matches the antd modal mask, which
 * already blurs). Applied per-modal via `styles.backdrop`; a global backdrop
 * rule can't be used because base-ui popups (Select/Menu lists) share the same
 * `role=presentation` element and would frost their own content.
 */
export const frostedModalStyles = { backdrop: { backdropFilter: 'blur(4px)' } };

interface AcceptContentProps {
  /** Titles of the exceptions the user is knowingly accepting with. */
  exceptions: string[];
  /** Perform the accept; resolve true to close, false to stay open (error shown by the page). */
  onConfirm: () => Promise<boolean>;
  subjectTitle: string;
}

const AcceptContent = memo<AcceptContentProps>(({ exceptions, onConfirm, subjectTitle }) => {
  const { t: translate } = useTranslation('verify');
  const { close } = useModalContext();
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      if (await onConfirm()) close();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>{translate('acceptance.accept.summary', { title: subjectTitle })}</div>
      {exceptions.length > 0 && (
        <div className={`flex flex-col gap-1 ${styles.warning}`}>
          <div className="font-semibold text-[13px]">
            {translate('acceptance.accept.exceptionsTitle', { count: exceptions.length })}
          </div>
          {exceptions.map((title) => (
            <div className="text-[12px] text-muted-foreground" key={title}>
              · {title}
            </div>
          ))}
          <div className="text-[12px] text-muted-foreground">
            {translate('acceptance.accept.exceptionsHint')}
          </div>
        </div>
      )}
      <div className="flex gap-2 justify-end">
        <Button disabled={loading} onClick={close}>
          {translate('acceptance.actions.cancel')}
        </Button>
        <Button loading={loading} variant="outline" onClick={handleConfirm}>
          {translate('acceptance.actions.confirmAccept')}
        </Button>
      </div>
    </div>
  );
});

AcceptContent.displayName = 'AcceptanceAcceptContent';

/** Accept confirmation — spells out the terminal event and the exceptions taken with it. */
export const openAcceptModal = (options: AcceptContentProps): ModalInstance =>
  createModal({
    content: <AcceptContent {...options} />,
    footer: null,
    maskClosable: true,
    styles: frostedModalStyles,
    title: t('acceptance.actions.accept', { ns: 'verify' }),
    width: 'min(90vw, 480px)',
  });

interface RejectContentProps {
  /** Perform the reject with the reason; resolve true to close. */
  onConfirm: (comment: string) => Promise<boolean>;
}

const RejectContent = memo<RejectContentProps>(({ onConfirm }) => {
  const { t: translate } = useTranslation('verify');
  const { close } = useModalContext();
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    const trimmed = comment.trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      if (await onConfirm(trimmed)) close();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="text-[13px] text-muted-foreground">
        {translate('acceptance.reject.description')}
      </div>
      <Textarea
        placeholder={translate('acceptance.reject.placeholder')}
        rows={3}
        style={{ maxHeight: '6lh' }}
        value={comment}
        onChange={(event) => setComment(event.target.value)}
      />
      <div className="flex gap-2 justify-end">
        <Button disabled={loading} onClick={close}>
          {translate('acceptance.actions.cancel')}
        </Button>
        <Button
          disabled={!comment.trim()}
          loading={loading}
          variant="outline"
          onClick={handleConfirm}
        >
          {translate('acceptance.actions.confirmReject')}
        </Button>
      </div>
    </div>
  );
});

RejectContent.displayName = 'AcceptanceRejectContent';

/** Reject dialog — the reason is required: it is the next round's input, not a note. */
export const openRejectModal = (options: RejectContentProps): ModalInstance =>
  createModal({
    content: <RejectContent {...options} />,
    footer: null,
    maskClosable: true,
    styles: frostedModalStyles,
    title: t('acceptance.actions.reject', { ns: 'verify' }),
    width: 'min(90vw, 480px)',
  });

interface GroupFeedbackContentProps {
  /** Override the group-scoped description (the decision bar's global note). */
  description?: string;
  groupLabel: string;
  /** Record the feedback (note + any screenshots); resolve true to close. */
  onConfirm: (comment: string, fileIds: string[]) => Promise<boolean>;
}

const GroupFeedbackContent = memo<GroupFeedbackContentProps>(
  ({ description, groupLabel, onConfirm }) => {
    const { t: translate } = useTranslation('verify');
    const { close } = useModalContext();
    const [comment, setComment] = useState('');
    const [loading, setLoading] = useState(false);
    const { attachments, fileIds, handlePaste, remove, uploadFiles, uploading } =
      useFeedbackAttachments();

    const handleConfirm = async () => {
      const trimmed = comment.trim();
      if (!trimmed) return;
      setLoading(true);
      try {
        if (await onConfirm(trimmed, fileIds)) close();
      } finally {
        setLoading(false);
      }
    };

    return (
      <div className="flex flex-col gap-4">
        <div className="text-[13px] text-muted-foreground">
          {description ?? translate('acceptance.group.feedbackDescription', { label: groupLabel })}
        </div>
        <div className="flex flex-col gap-2">
          <Textarea
            placeholder={translate('acceptance.group.feedbackPlaceholder')}
            rows={3}
            style={{ maxHeight: '8lh' }}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            onPaste={handlePaste}
          />
          {/* One row hugging the input — attachments belong to the note. */}
          <div className="flex items-center gap-2 flex-wrap">
            <AttachmentStrip
              attachments={attachments}
              disabled={loading}
              uploading={uploading}
              onRemove={remove}
            />
            <AttachmentUploadButton disabled={loading} onFiles={uploadFiles} />
          </div>
        </div>
        <div className="flex items-center gap-2 justify-end">
          <Button disabled={loading} onClick={close}>
            {translate('acceptance.actions.cancel')}
          </Button>
          <Button
            disabled={!comment.trim() || uploading}
            loading={loading}
            variant="outline"
            onClick={handleConfirm}
          >
            {translate('acceptance.group.feedbackSubmit')}
          </Button>
        </div>
      </div>
    );
  },
);

GroupFeedbackContent.displayName = 'AcceptanceGroupFeedbackContent';

/**
 * Group-scoped feedback dialog — the channel for concerns that belong to no
 * single check (which may well be accepted) yet must reach the next round.
 */
export const openGroupFeedbackModal = (
  options: GroupFeedbackContentProps & { title?: string },
): ModalInstance =>
  createModal({
    content: <GroupFeedbackContent {...options} />,
    footer: null,
    maskClosable: true,
    styles: frostedModalStyles,
    title: options.title ?? t('acceptance.group.feedbackTitle', { ns: 'verify' }),
    width: 'min(90vw, 520px)',
  });
