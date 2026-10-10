'use client';

import { Crosshair, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { Textarea } from '@/components/ui/textarea';

import type { DraftAnnotationEntry, RejectableEvidence } from '../Review/rejectDraft';

const styles = {
  index:
    'flex-none size-[18px] rounded-[50%] text-[11px] font-semibold leading-[18px] text-white text-center bg-destructive',
  jump: 'cursor-pointer inline-flex gap-[5px] items-center self-start py-[7px] px-0.5 border-none text-[13px] text-(--ant-color-link) bg-none bg-transparent active:opacity-60',
};

interface RegionNoteRowProps {
  /** Rendered beside the field — the desktop's number badge. */
  badge?: ReactNode;
  /** Rendered above the field — the phone's jump-back link. */
  caption?: ReactNode;
  /** 16px on a phone, so focusing the field never zooms the page. */
  fontSize?: number;
  /** 1-based, for the accessible name and the remove label. */
  index: number;
  onChange: (comment: string) => void;
  onRemove: () => void;
  placeholder: string;
  value: string;
}

const RegionNoteRow = memo<RegionNoteRowProps>(
  ({ badge, caption, fontSize, index, placeholder, value, onChange, onRemove }) => {
    const { t } = useTranslation('verify');

    return (
      <div className="flex flex-col gap-1">
        {caption}
        <div className="flex items-start gap-2">
          {badge}
          <Textarea
            aria-label={t('acceptance.review.annotationPlaceholder', { index })}
            placeholder={placeholder}
            rows={1}
            style={{ flex: 1, fontSize, maxHeight: '5lh' }}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
          <ActionIcon
            aria-label={t('acceptance.review.removeRegion', { index })}
            icon={Trash2}
            size={{ blockSize: 44, size: 18 }}
            onClick={onRemove}
          />
        </div>
      </div>
    );
  },
);

RegionNoteRow.displayName = 'AcceptanceRegionNoteRow';

interface RegionNotesProps {
  annotations: DraftAnnotationEntry[];
  onChange: (key: number, comment: string) => void;
  onRemove: (key: number) => void;
}

/** Notes for the regions on the image currently on screen (desktop side panel). */
export const RegionNotes = memo<RegionNotesProps>(({ annotations, onChange, onRemove }) => {
  const { t } = useTranslation('verify');

  return annotations.map((annotation, index) => (
    <RegionNoteRow
      index={index + 1}
      key={annotation.key}
      placeholder={t('acceptance.review.annotationPlaceholder', { index: index + 1 })}
      value={annotation.comment}
      badge={
        <span className={styles.index} style={{ marginBlockStart: 6 }}>
          {index + 1}
        </span>
      }
      onChange={(comment) => onChange(annotation.key, comment)}
      onRemove={() => onRemove(annotation.key)}
    />
  ));
});

RegionNotes.displayName = 'AcceptanceRegionNotes';

interface MobileRegionNotesProps extends RegionNotesProps {
  evidence: RejectableEvidence[];
  /** Show the region's image and put the reviewer back in marking mode. */
  onJump: (evidenceId: string) => void;
}

/**
 * Every region across every image, in one list under the phone's stage.
 *
 * A phone has no side panel to park the other images' notes in, so each row
 * says which image and region it belongs to and links back to it.
 */
export const MobileRegionNotes = memo<MobileRegionNotesProps>(
  ({ annotations, evidence, onChange, onJump, onRemove }) => {
    const { t } = useTranslation('verify');

    return annotations.map((annotation, index) => {
      const imageIndex = evidence.findIndex((item) => item.id === annotation.evidenceId);
      const regionIndex = annotations
        .filter((item) => item.evidenceId === annotation.evidenceId)
        .findIndex((item) => item.key === annotation.key);

      return (
        <RegionNoteRow
          fontSize={16}
          index={index + 1}
          key={annotation.key}
          placeholder={t('acceptance.review.rejectPlaceholder')}
          value={annotation.comment}
          caption={
            <button
              className={styles.jump}
              type={'button'}
              onClick={() => onJump(annotation.evidenceId)}
            >
              <Crosshair size={13} />
              {t('acceptance.review.regionImage', {
                image: imageIndex + 1,
                region: regionIndex + 1,
              })}
            </button>
          }
          onChange={(comment) => onChange(annotation.key, comment)}
          onRemove={() => onRemove(annotation.key)}
        />
      );
    });
  },
);

MobileRegionNotes.displayName = 'AcceptanceMobileRegionNotes';
