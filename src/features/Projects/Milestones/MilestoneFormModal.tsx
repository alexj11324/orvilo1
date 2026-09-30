'use client';
import { DatePicker } from '@lobehub/ui';
import { createModal, ModalFooter, toast, useModalContext } from '@lobehub/ui/base-ui';
import dayjs from 'dayjs';
import { t as translate } from 'i18next';
import { CalendarIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useProjectStore } from '@/store/project';

import type { MilestoneRow } from './milestonePageData';

interface MilestoneFormContentProps {
  milestone?: MilestoneRow;
  projectId: string;
}

/**
 * One name/date/description form for both milestone writes on the tab page —
 * the same fields the overview's inline composer collects, in the
 * `createModal` shell this feature already uses for project forms.
 */
const MilestoneFormContent = ({ milestone, projectId }: MilestoneFormContentProps) => {
  const { t } = useTranslation(['project', 'common']);
  const { close } = useModalContext();
  const createMilestone = useProjectStore((s) => s.createMilestone);
  const updateMilestone = useProjectStore((s) => s.updateMilestone);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(milestone?.name ?? '');
  const [description, setDescription] = useState(milestone?.description ?? '');
  const [date, setDate] = useState<string | undefined>(milestone?.date ?? undefined);
  const savingRef = useRef(false);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const input = {
        date: date ?? null,
        description: description.trim() || null,
        name: trimmed,
      };
      const result = milestone
        ? await updateMilestone(projectId, milestone.id, input)
        : await createMilestone(projectId, input);
      if (result.refreshError) toast.warning(t('overview.milestoneRefreshError'));
      close();
    } catch (error) {
      console.error('Failed to save project milestone', error);
      toast.error(t('overview.milestoneSaveError'));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex flex-col" style={{ gap: 12, padding: 16 }}>
        <div className="flex flex-col" style={{ gap: 6 }}>
          <span className="text-sm" style={{ fontSize: 13, fontWeight: 500 }}>
            {t('create.milestone.name')}
          </span>
          <Input
            autoFocus
            maxLength={255}
            placeholder={t('create.milestone.name')}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) void submit();
            }}
          />
        </div>
        <div className="flex flex-col" style={{ gap: 6 }}>
          <span className="text-sm" style={{ fontSize: 13, fontWeight: 500 }}>
            {t('milestones.form.targetDate')}
          </span>
          <DatePicker
            allowClear
            aria-label={t('milestones.form.targetDate')}
            format="MMM D, YYYY"
            placeholder={t('create.milestone.date')}
            prefix={<CalendarIcon size={13} />}
            value={date ? dayjs(date) : null}
            onChange={(value) => {
              const picked = Array.isArray(value) ? value[0] : value;
              setDate(picked ? picked.format('YYYY-MM-DD') : undefined);
            }}
          />
        </div>
        <div className="flex flex-col" style={{ gap: 6 }}>
          <span className="text-sm" style={{ fontSize: 13, fontWeight: 500 }}>
            {t('create.milestone.description')}
          </span>
          <Textarea
            placeholder={t('create.milestone.description')}
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
      </div>
      <ModalFooter>
        <Button variant="outline" onClick={close}>
          {t('common:cancel')}
        </Button>
        <Button
          aria-busy={saving}
          disabled={!name.trim() || saving}
          variant="default"
          onClick={() => void submit()}
        >
          {saving && <Spinner />}
          {milestone ? t('common:save') : t('create.milestone.create')}
        </Button>
      </ModalFooter>
    </>
  );
};

interface OpenMilestoneFormOptions {
  milestone?: MilestoneRow;
  projectId: string;
}

export const openMilestoneFormModal = ({ milestone, projectId }: OpenMilestoneFormOptions) =>
  createModal({
    content: <MilestoneFormContent milestone={milestone} projectId={projectId} />,
    footer: null,
    styles: { content: { padding: 0 } },
    title: translate(milestone ? 'milestones.form.editTitle' : 'milestones.form.createTitle', {
      ns: 'project',
    }),
    width: 420,
  });
