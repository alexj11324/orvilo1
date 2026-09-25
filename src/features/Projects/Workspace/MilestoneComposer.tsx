'use client';

import { DatePicker, Flexbox, Icon, Input, TextArea } from '@lobehub/ui';
import { Button } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import dayjs from 'dayjs';
import { CalendarIcon } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface MilestoneDraft {
  date?: string;
  description: string;
  name: string;
}

const styles = createStaticStyles(({ css }) => ({
  composer: css`
    padding-block: 12px;
    padding-inline: 12px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;
  `,
  datePicker: css`
    width: 118px;
    height: 28px;
    border-color: transparent;
    border-radius: 9999px;

    font-size: 13px;

    background: transparent;

    &:hover {
      background: ${cssVar.colorFillQuaternary};
    }
  `,
}));

interface MilestoneComposerProps {
  initial?: { date?: string | null; description?: string | null; name: string };
  onCancel: () => void;
  onSubmit: (draft: MilestoneDraft) => Promise<void>;
  saving: boolean;
}

/** Inline name/date/description editor shared by the create and edit flows. */
export const MilestoneComposer = memo<MilestoneComposerProps>(
  ({ initial, onCancel, onSubmit, saving }) => {
    const { t } = useTranslation(['project', 'common']);
    const [name, setName] = useState(initial?.name ?? '');
    const [description, setDescription] = useState(initial?.description ?? '');
    const [date, setDate] = useState<string | undefined>(initial?.date ?? undefined);

    const submit = () => {
      const trimmed = name.trim();
      if (!trimmed || saving) return;
      void onSubmit({ date, description: description.trim(), name: trimmed });
    };

    return (
      <Flexbox className={styles.composer} gap={8}>
        <Input
          autoFocus
          aria-label={t('create.milestone.name')}
          placeholder={t('create.milestone.name')}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
            if (event.key === 'Escape') onCancel();
          }}
        />
        <DatePicker
          allowClear
          aria-label={t('create.milestone.date')}
          className={styles.datePicker}
          format="MMM D, YYYY"
          placeholder={t('create.milestone.date')}
          prefix={<Icon icon={CalendarIcon} size={13} />}
          size="small"
          suffixIcon={null}
          value={date ? dayjs(date) : null}
          onChange={(value) => {
            const picked = Array.isArray(value) ? value[0] : value;
            setDate(picked ? picked.format('YYYY-MM-DD') : undefined);
          }}
        />
        <TextArea
          aria-label={t('create.milestone.description')}
          placeholder={t('create.milestone.description')}
          rows={2}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <Flexbox horizontal gap={8} justify={'end'}>
          <Button size={'small'} onClick={onCancel}>
            {t('common:cancel')}
          </Button>
          <Button
            disabled={!name.trim()}
            loading={saving}
            size={'small'}
            type={'primary'}
            onClick={submit}
          >
            {initial ? t('common:save') : t('create.milestone.create')}
          </Button>
        </Flexbox>
      </Flexbox>
    );
  },
);

MilestoneComposer.displayName = 'MilestoneComposer';

export default MilestoneComposer;
