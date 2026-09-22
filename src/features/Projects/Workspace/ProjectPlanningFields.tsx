import { DatePicker, Flexbox } from '@lobehub/ui';
import { Select, Tabs, toast } from '@lobehub/ui/base-ui';
import type { ProjectDatePrecision } from '@orvilo/types';
import { createStaticStyles } from 'antd-style';
import dayjs from 'dayjs';
import { UserRoundIcon } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import Avatar from '@/components/Avatar';
import { useWorkspaceMembersQuery } from '@/features/Teammates/api/hooks';
import { type ProjectDetail, useProjectStore } from '@/store/project';

import {
  formatProjectDate,
  getProjectDatePickerMode,
  PROJECT_DATE_PRECISIONS,
} from '../projectPlanningDate';

const styles = createStaticStyles(({ css }) => ({
  accessibleLabel: css`
    position: absolute;

    overflow: hidden;

    width: 1px;
    height: 1px;

    white-space: nowrap;

    clip-path: inset(50%);
  `,
  field: css`
    width: auto;
    min-width: 0;
    max-width: 100%;
    height: 28px;
    border-color: transparent;

    font-size: 13px;

    background: transparent;
  `,
  date: css`
    flex: 0 0 120px;
    width: 120px;
    min-width: 0;
  `,
}));

function usePlanningMutation(projectId: string) {
  const { t } = useTranslation('project');
  const update = useProjectStore((s) => s.updateProject);
  const lock = useRef(false);
  const [saving, setSaving] = useState(false);
  const save = async (input: Parameters<typeof update>[1]) => {
    if (lock.current) return;
    lock.current = true;
    setSaving(true);
    try {
      await update(projectId, input);
    } catch (error) {
      console.error('Failed to update project planning field', error);
      toast.error(t('properties.saveError'));
    } finally {
      lock.current = false;
      setSaving(false);
    }
  };
  return { save, saving };
}

const priorities = ['noPriority', 'urgent', 'high', 'normal', 'low'] as const;

export function ProjectLeadField({ project }: { project: ProjectDetail['project'] }) {
  const { t } = useTranslation('project');
  const id = useId();
  const members = useWorkspaceMembersQuery();
  const { save, saving } = usePlanningMutation(project.id);
  if (members.error && !members.data)
    return (
      <AsyncError error={members.error} variant="inline" onRetry={() => void members.mutate()} />
    );
  const selectedMember = members.data?.find((member) => member.userId === project.leadUserId);
  const options = (members.data ?? [])
    .filter(
      (member) =>
        (!member.deletedAt && !member.suspendedAt) || member.userId === project.leadUserId,
    )
    .map((member) => {
      const name = member.user?.fullName || member.user?.username || member.userId;
      return {
        disabled: !!member.deletedAt || !!member.suspendedAt,
        label: (
          <Flexbox horizontal align="center" gap={6}>
            <Avatar avatar={member.user?.avatar ?? undefined} name={name} size={18} />
            {name}
          </Flexbox>
        ),
        title: name,
        value: member.userId,
      };
    });
  if (project.leadUserId && !selectedMember)
    options.push({
      disabled: true,
      label: <>{t('properties.unavailableLead')}</>,
      title: t('properties.unavailableLead'),
      value: project.leadUserId,
    });
  return (
    <>
      <label className={styles.accessibleLabel} htmlFor={id}>
        {t('properties.lead')}
      </label>
      <Select<string | number>
        showSearch
        className={styles.field}
        disabled={saving || members.isLoading}
        id={id}
        labelRender={(option) => (option.value === 0 ? t('properties.addLead') : option.label)}
        loading={saving || members.isLoading}
        options={[{ label: t('properties.noLead'), value: 0 }, ...options]}
        popupMatchSelectWidth={false}
        prefix={project.leadUserId ? undefined : UserRoundIcon}
        size="small"
        suffixIcon={null}
        value={project.leadUserId ?? 0}
        onChange={(value) => {
          if ((value === 0 || typeof value === 'string') && value !== (project.leadUserId ?? 0))
            void save({ leadUserId: value === 0 ? null : value });
        }}
      />
    </>
  );
}

export function ProjectPriorityField({ project }: { project: ProjectDetail['project'] }) {
  const { t } = useTranslation('project');
  const { save, saving } = usePlanningMutation(project.id);
  const id = useId();
  return (
    <>
      <label className={styles.accessibleLabel} htmlFor={id}>
        {t('properties.priority')}
      </label>
      <Select
        className={styles.field}
        disabled={saving}
        id={id}
        loading={saving}
        options={priorities.map((name, value) => ({ label: t(`create.priority.${name}`), value }))}
        size="small"
        suffixIcon={null}
        value={project.priority ?? 0}
        onChange={(value) => {
          if (
            (value === 0 || value === 1 || value === 2 || value === 3 || value === 4) &&
            value !== project.priority
          )
            void save({ priority: value });
        }}
      />
    </>
  );
}

export function ProjectDateField({
  kind,
  project,
}: {
  kind: 'startDate' | 'targetDate';
  project: ProjectDetail['project'];
}) {
  const { t } = useTranslation('project');
  const { save, saving } = usePlanningMutation(project.id);
  const precisionField = kind === 'startDate' ? 'startDatePrecision' : 'targetDatePrecision';
  const storedPrecision = project[precisionField] ?? 'day';
  const [precision, setPrecision] = useState<ProjectDatePrecision>(storedPrecision);
  return (
    <DatePicker
      allowClear
      aria-label={t(`create.${kind}`)}
      className={`${styles.field} ${styles.date}`}
      disabled={saving}
      format={(date) => formatProjectDate(date.format('YYYY-MM-DD'), storedPrecision)}
      picker={getProjectDatePickerMode(precision)}
      placeholder={t(kind === 'startDate' ? 'create.start' : 'create.target')}
      size="small"
      suffixIcon={null}
      value={project[kind] ? dayjs(project[kind]) : null}
      panelRender={(panel) => (
        <>
          <Tabs
            activeKey={precision}
            size="small"
            items={PROJECT_DATE_PRECISIONS.map((value) => ({
              key: value,
              label: t(`create.datePrecision.${value}`),
            }))}
            onChange={(value) => {
              if (PROJECT_DATE_PRECISIONS.includes(value))
                setPrecision(value as ProjectDatePrecision);
            }}
          />
          {panel}
        </>
      )}
      onChange={(value) => {
        let date = value;
        if (date && precision !== 'day') {
          const month =
            precision === 'year'
              ? 0
              : precision === 'halfYear'
                ? Math.floor(date.month() / 6) * 6
                : precision === 'quarter'
                  ? Math.floor(date.month() / 3) * 3
                  : date.month();
          date = date.date(1).month(month);
        }
        void save({
          [kind]: date?.format('YYYY-MM-DD') ?? null,
          [precisionField]: date ? precision : null,
        });
      }}
      onOpenChange={(open) => {
        if (open) setPrecision(storedPrecision);
      }}
    />
  );
}

export function ProjectDateFields({ project }: { project: ProjectDetail['project'] }) {
  return (
    <Flexbox horizontal align="center" gap={4} style={{ minWidth: 0, flex: 1 }} wrap="wrap">
      <ProjectDateField kind="startDate" project={project} />
      <span aria-hidden>→</span>
      <ProjectDateField kind="targetDate" project={project} />
    </Flexbox>
  );
}
