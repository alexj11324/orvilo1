import { DatePicker, Flexbox, Icon } from '@lobehub/ui';
import { Select, Tabs, toast } from '@lobehub/ui/base-ui';
import type { ProjectDatePrecision } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import dayjs from 'dayjs';
import {
  ArrowRightIcon,
  CalendarDaysIcon,
  CalendarIcon,
  TagIcon,
  UserRoundIcon,
} from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import Avatar from '@/components/Avatar';
import { isPriorityLevel, PriorityIcon } from '@/components/PriorityIcon';
import { BODY_TEXT_COLOR } from '@/features/Projects/sectionLabel';
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
  inline: css`
    flex: 0 0 auto;

    width: auto;
    min-width: 0;
    max-width: 100%;
    height: 28px;
    padding-block: 3px;
    padding-inline: 6px;
    border: 1px solid transparent;
    border-radius: 9999px;

    font-size: 13px;
    font-weight: 500;
    color: ${BODY_TEXT_COLOR};

    background: transparent;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }

    &:focus-within {
      outline: 2px solid ${cssVar.colorPrimary};
    }

    .ant-select-selector {
      height: 28px !important;
      padding: 0 !important;
      border: 0 !important;
      border-radius: 9999px !important;

      background: transparent !important;
    }

    /* antd re-declares its text colour on each control, so the body ink is
       set on the text nodes themselves rather than inherited. */
    .ant-select-selection-item,
    .ant-picker-input > input {
      font-size: 13px !important;
      font-weight: 500 !important;
      color: ${BODY_TEXT_COLOR} !important;
    }
  `,
  /* A date control whose calendar glyph leads the text instead of trailing
     it, and whose input hugs its content. Shared by the overview's inline
     chip and the rail's `Dates` row — the reference puts a 16px icon inside
     each of those buttons (text offset +30px = the icon's lane) rather than
     antd's trailing suffix. */
  leadingIconDate: css`
    border-radius: 8px;

    .ant-picker-input {
      gap: 8px;
    }

    .ant-picker-suffix {
      order: -1;
      margin-inline: 0;
    }

    .ant-picker-input > input {
      width: auto;
      min-width: 4ch;

      field-sizing: content;
    }
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

export function ProjectLabelsField({ detail }: { detail: ProjectDetail }) {
  const { t } = useTranslation('project');
  const id = useId();
  const query = useProjectStore((s) => s.useFetchProjectLabels)();
  const { save, saving } = usePlanningMutation(detail.project.id);
  if (query.error && !query.data)
    return <AsyncError error={query.error} variant="inline" onRetry={() => void query.mutate()} />;
  const labels = query.data?.data ?? detail.labels ?? [];
  return (
    <>
      <label className={styles.accessibleLabel} htmlFor={id}>
        {t('properties.labels')}
      </label>
      <Select
        showSearch
        className={styles.field}
        disabled={saving || query.isLoading}
        id={id}
        loading={saving || query.isLoading}
        mode="multiple"
        options={labels.map((label) => ({ label: label.name, value: label.id }))}
        placeholder={t('properties.addLabels')}
        popupMatchSelectWidth={false}
        prefix={TagIcon}
        size="small"
        suffixIcon={null}
        value={(detail.labels ?? []).map((label) => label.id)}
        onChange={(value) => {
          if (Array.isArray(value)) void save({ labelIds: value });
        }}
      />
    </>
  );
}

export function ProjectLeadField({
  inline = false,
  project,
}: {
  inline?: boolean;
  project: ProjectDetail['project'];
}) {
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
      <Select
        showSearch
        className={inline ? `${styles.field} ${styles.inline}` : styles.field}
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

export function ProjectPriorityField({
  inline = false,
  project,
}: {
  inline?: boolean;
  project: ProjectDetail['project'];
}) {
  const { t } = useTranslation('project');
  const { save, saving } = usePlanningMutation(project.id);
  const id = useId();
  return (
    <>
      <label className={styles.accessibleLabel} htmlFor={id}>
        {t('properties.priority')}
      </label>
      <Select
        className={inline ? `${styles.field} ${styles.inline}` : styles.field}
        disabled={saving}
        id={id}
        loading={saving}
        size="small"
        suffixIcon={null}
        value={project.priority ?? 0}
        options={priorities.map((name, value) => ({
          label: (
            <Flexbox horizontal align="center" gap={6}>
              <PriorityIcon priority={value} size={16} />
              {t(`create.priority.${name}`)}
            </Flexbox>
          ),
          value,
        }))}
        onChange={(value) => {
          if (isPriorityLevel(value) && value !== project.priority) void save({ priority: value });
        }}
      />
    </>
  );
}

export function ProjectDateField({
  fitContent = false,
  inline = false,
  kind,
  project,
}: {
  /**
   * Size to content instead of the fixed box the overview's chip row keeps.
   *
   * The rail's `Dates` row holds two controls plus an arrow inside a 257px
   * value column. At a fixed 120px each the row overflowed and wrapped, which
   * doubled it: measured 60px on the candidate against the reference's 28px,
   * where the controls are content-sized ("Sep 21st" 84px, "Target" 72px).
   * The standalone usage keeps its box — it sits in a wrapping row of chips,
   * where the fixed width is what keeps them even.
   */
  fitContent?: boolean;
  inline?: boolean;
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
      disabled={saving}
      format={(date) => formatProjectDate(date.format('YYYY-MM-DD'), storedPrecision)}
      picker={getProjectDatePickerMode(precision)}
      placeholder={t(kind === 'startDate' ? 'create.start' : 'create.target')}
      size="small"
      value={project[kind] ? dayjs(project[kind]) : null}
      className={
        inline
          ? `${styles.field} ${styles.inline} ${styles.leadingIconDate}`
          : fitContent
            ? `${styles.field} ${styles.leadingIconDate}`
            : `${styles.field} ${styles.date}`
      }
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
              if (PROJECT_DATE_PRECISIONS.includes(value as ProjectDatePrecision))
                setPrecision(value as ProjectDatePrecision);
            }}
          />
          {panel}
        </>
      )}
      suffixIcon={
        inline || fitContent ? (
          <Icon icon={kind === 'startDate' ? CalendarDaysIcon : CalendarIcon} size={16} />
        ) : null
      }
      onChange={(value) => {
        let date = Array.isArray(value) ? value[0] : value;
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
    // No `wrap`: the reference keeps `Dates` on one line, and content-sized
    // controls leave this row far short of the column (≈175px in 257px).
    // The separator is a bare 16px svg arrow on the reference, not a text
    // glyph — same treatment as the overview's main property row.
    <Flexbox horizontal align="center" gap={4} style={{ minWidth: 0, flex: 1 }}>
      <ProjectDateField fitContent kind="startDate" project={project} />
      <Icon aria-hidden icon={ArrowRightIcon} size={16} />
      <ProjectDateField fitContent kind="targetDate" project={project} />
    </Flexbox>
  );
}
