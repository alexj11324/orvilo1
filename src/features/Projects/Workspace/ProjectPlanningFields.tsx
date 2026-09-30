import { DatePicker } from '@lobehub/ui';
import { toast } from '@lobehub/ui/base-ui';
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
import { createElement, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import Avatar from '@/components/Avatar';
import { isPriorityLevel, PriorityIcon } from '@/components/PriorityIcon';
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

    .ant-select-selection-item,
    .ant-picker-input > input {
      font-size: 13px !important;
      font-weight: 500 !important;
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
  const labelPickerOptions = labels.map((label) => ({ label: label.name, value: label.id }));
  return (
    <>
      <label className={styles.accessibleLabel} htmlFor={id}>
        {t('properties.labels')}
      </label>
      <Combobox
        multiple
        disabled={saving || query.isLoading}
        items={labelPickerOptions.map((option) => option.value)}
        value={(detail.labels ?? []).map((label) => label.id)}
        itemToStringLabel={(value) => {
          const option = labelPickerOptions.find((option) => option.value === value);
          return option && 'title' in option && typeof option.title === 'string'
            ? option.title
            : typeof option?.label === 'string'
              ? option.label
              : String(value);
        }}
        onValueChange={(value) => {
          if (Array.isArray(value)) void save({ labelIds: value });
        }}
      >
        <>
          <ComboboxChips className="min-w-0 max-w-full">
            <TagIcon aria-hidden size={16} />
            {(detail.labels ?? [])
              .map((label) => label.id)
              .map((value) => (
                <ComboboxChip key={value}>
                  {labelPickerOptions.find((option) => option.value === value)?.label ??
                    String(value)}
                </ComboboxChip>
              ))}
            <ComboboxChipsInput
              aria-label={t('properties.labels')}
              disabled={saving || query.isLoading}
              id={id}
              placeholder={t('properties.addLabels')}
            />
          </ComboboxChips>
          <ComboboxContent className="min-w-56">
            <ComboboxEmpty>{t('properties.addLabels')}</ComboboxEmpty>
            <ComboboxList>
              {(value: (typeof labelPickerOptions)[number]['value']) => {
                const option = labelPickerOptions.find((option) => option.value === value);
                return (
                  <ComboboxItem
                    disabled={!!option && 'disabled' in option && option.disabled === true}
                    key={value}
                    value={value}
                  >
                    {option?.label}
                  </ComboboxItem>
                );
              }}
            </ComboboxList>
          </ComboboxContent>
        </>
      </Combobox>
    </>
  );
}

export function ProjectLeadField({
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
          <div className="flex flex-row" style={{ alignItems: 'center', gap: 6 }}>
            <Avatar avatar={member.user?.avatar ?? undefined} name={name} size={18} />
            {name}
          </div>
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
  const leadPickerOptions = [{ label: t('properties.noLead'), value: 0 }, ...options];
  return (
    <>
      <label className={styles.accessibleLabel} htmlFor={id}>
        {t('properties.lead')}
      </label>
      <Combobox
        disabled={saving || members.isLoading}
        items={leadPickerOptions.map((option) => option.value)}
        value={project.leadUserId ?? 0}
        itemToStringLabel={(value) => {
          const option = leadPickerOptions.find((option) => option.value === value);
          if (value === 0) return t('properties.addLead');
          return option && 'title' in option && typeof option.title === 'string'
            ? option.title
            : typeof option?.label === 'string'
              ? option.label
              : String(value);
        }}
        onValueChange={(value) => {
          if (value === null) return;
          if ((value === 0 || typeof value === 'string') && value !== (project.leadUserId ?? 0))
            void save({ leadUserId: value === 0 ? null : value });
        }}
      >
        <>
          <ComboboxInput
            aria-label={t('properties.lead')}
            className="min-w-0 max-w-full"
            disabled={saving || members.isLoading}
            id={id}
            placeholder={t('properties.addLead')}
            showClear={false}
          >
            {!project.leadUserId && <UserRoundIcon aria-hidden size={16} />}
          </ComboboxInput>
          <ComboboxContent className="min-w-56">
            <ComboboxEmpty>{t('properties.members')}</ComboboxEmpty>
            <ComboboxList>
              {(value: (typeof leadPickerOptions)[number]['value']) => {
                const option = leadPickerOptions.find((option) => option.value === value);
                return (
                  <ComboboxItem
                    disabled={!!option && 'disabled' in option && option.disabled === true}
                    key={value}
                    value={value}
                  >
                    {option?.label}
                  </ComboboxItem>
                );
              }}
            </ComboboxList>
          </ComboboxContent>
        </>
      </Combobox>
    </>
  );
}

export function ProjectPriorityField({
  project,
}: {
  inline?: boolean;
  project: ProjectDetail['project'];
}) {
  const { t } = useTranslation('project');
  const { save, saving } = usePlanningMutation(project.id);
  const id = useId();
  const priorityPickerOptions = priorities.map((name, value) => ({
    label: (
      <div className="flex flex-row" style={{ alignItems: 'center', gap: 6 }}>
        <PriorityIcon priority={value} size={16} />
        {t(`create.priority.${name}`)}
      </div>
    ),
    value,
  }));
  return (
    <>
      <label className={styles.accessibleLabel} htmlFor={id}>
        {t('properties.priority')}
      </label>
      <Select
        disabled={saving}
        items={priorityPickerOptions}
        value={project.priority ?? 0}
        onValueChange={(value) => {
          if (value === null) return;
          if (isPriorityLevel(value) && value !== project.priority) void save({ priority: value });
        }}
      >
        <SelectTrigger className="min-w-0 max-w-full" id={id} size="sm">
          <SelectValue placeholder={undefined} />
        </SelectTrigger>
        <SelectContent>
          {priorityPickerOptions.map((option) => (
            <SelectItem
              disabled={'disabled' in option && option.disabled === true}
              key={option.value}
              value={option.value}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
            value={precision}
            onValueChange={(value) => {
              if (PROJECT_DATE_PRECISIONS.includes(value as ProjectDatePrecision))
                setPrecision(value as ProjectDatePrecision);
            }}
          >
            <TabsList>
              {PROJECT_DATE_PRECISIONS.map((value) => (
                <TabsTrigger key={value} value={value}>
                  {t(`create.datePrecision.${value}`)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {panel}
        </>
      )}
      suffixIcon={
        inline || fitContent
          ? createElement(kind === 'startDate' ? CalendarDaysIcon : CalendarIcon, { size: 16 })
          : null
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
    <div className="flex flex-row" style={{ alignItems: 'center', gap: 4, minWidth: 0, flex: 1 }}>
      <ProjectDateField fitContent kind="startDate" project={project} />
      <ArrowRightIcon aria-hidden size={16} />
      <ProjectDateField fitContent kind="targetDate" project={project} />
    </div>
  );
}
