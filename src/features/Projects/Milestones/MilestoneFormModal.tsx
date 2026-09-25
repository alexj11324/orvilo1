'use client';

import { DatePicker, Flexbox, Icon, Input, TextArea } from '@lobehub/ui';
import {
  Button,
  createModal,
  ModalFooter,
  Text,
  toast,
  useModalContext,
} from '@lobehub/ui/base-ui';
import dayjs from 'dayjs';
import { t as translate } from 'i18next';
import { CalendarIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useProjectStore } from '@/store/project';

import { useProjectDateFormatter } from '../useProjectDateFormatter';
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
  const formatDate = useProjectDateFormatter();
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
      if (milestone) {
        await updateMilestone(projectId, milestone.id, input);
      } else {
        await createMilestone(projectId, input);
      }
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
      <Flexbox gap={12} padding={16}>
        <Flexbox gap={6}>
          <Text fontSize={13} weight={500}>
            {t('create.milestone.name')}
          </Text>
          <Input
            autoFocus
            maxLength={255}
            placeholder={t('create.milestone.name')}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onPressEnter={() => void submit()}
          />
        </Flexbox>
        <Flexbox gap={6}>
          <Text fontSize={13} weight={500}>
            {t('milestones.form.targetDate')}
          </Text>
          <DatePicker
            allowClear
            aria-label={t('milestones.form.targetDate')}
            format={(value) => formatDate(value.format('YYYY-MM-DD'))}
            placeholder={t('create.milestone.date')}
            prefix={<Icon icon={CalendarIcon} size={13} />}
            value={date ? dayjs(date) : null}
            onChange={(value) => {
              const picked = Array.isArray(value) ? value[0] : value;
              setDate(picked ? picked.format('YYYY-MM-DD') : undefined);
            }}
          />
        </Flexbox>
        <Flexbox gap={6}>
          <Text fontSize={13} weight={500}>
            {t('create.milestone.description')}
          </Text>
          <TextArea
            placeholder={t('create.milestone.description')}
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Flexbox>
      </Flexbox>
      <ModalFooter>
        <Button onClick={close}>{t('common:cancel')}</Button>
        <Button
          disabled={!name.trim()}
          loading={saving}
          type={'primary'}
          onClick={() => void submit()}
        >
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
