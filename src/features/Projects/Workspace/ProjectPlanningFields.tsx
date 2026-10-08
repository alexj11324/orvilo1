import type { ProjectDatePrecision } from '@orvilo/types';
import { createStaticStyles } from 'antd-style';
import { cn } from 'cn';
import dayjs, { type Dayjs } from 'dayjs';
import { ArrowRightIcon, CalendarIcon, TagIcon, UserRoundIcon, XIcon } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import Avatar from '@/components/Avatar';
import DatePicker from '@/components/DatePicker';
import { PriorityIcon, resolvePriorityLevel } from '@/components/PriorityIcon';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from '@/components/ui/combobox';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import TaskPriorityTag from '@/features/AgentTasks/features/TaskPriorityTag';
import { useWorkspaceMembersQuery } from '@/features/Teammates/api/hooks';
import { type ProjectDetail, useProjectStore } from '@/store/project';

import {
  formatProjectDate,
  formatProjectDay,
  getProjectDatePickerMode,
  parseTypedProjectDay,
  PROJECT_DATE_PRECISIONS,
} from '../projectPlanningDate';
import { PROPERTY_CONTROL_CLASS } from './propertyControl';

const styles = createStaticStyles(({ css }) => ({
  accessibleLabel: css`
    position: absolute;

    overflow: hidden;

    width: 1px;
    height: 1px;

    white-space: nowrap;

    clip-path: inset(50%);
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
          <ComboboxTrigger
            aria-label={t('properties.labels')}
            className={PROPERTY_CONTROL_CLASS}
            id={id}
            render={<Button variant="ghost" />}
          >
            <TagIcon aria-hidden size={16} />
            <span className="truncate">
              {(detail.labels ?? []).map((label) => label.name).join(', ') ||
                t('properties.addLabels')}
            </span>
          </ComboboxTrigger>
          <ComboboxContent className="min-w-56">
            <ComboboxInput
              aria-label={t('properties.addLabels')}
              placeholder={t('properties.addLabels')}
              showTrigger={false}
            />
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

// Combobox values are strings; this sentinel marks the "no lead" pseudo-option.
const NO_LEAD_VALUE = '__noLead__';

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
  const leadPickerOptions = [{ label: t('properties.noLead'), value: NO_LEAD_VALUE }, ...options];
  return (
    <>
      <label className={styles.accessibleLabel} htmlFor={id}>
        {t('properties.lead')}
      </label>
      <Combobox
        disabled={saving || members.isLoading}
        items={leadPickerOptions.map((option) => option.value)}
        value={project.leadUserId ?? NO_LEAD_VALUE}
        itemToStringLabel={(value) => {
          const option = leadPickerOptions.find((option) => option.value === value);
          if (value === NO_LEAD_VALUE) return t('properties.addLead');
          return option && 'title' in option && typeof option.title === 'string'
            ? option.title
            : typeof option?.label === 'string'
              ? option.label
              : String(value);
        }}
        onValueChange={(value) => {
          if (value === null || value === (project.leadUserId ?? NO_LEAD_VALUE)) return;
          void save({ leadUserId: value === NO_LEAD_VALUE ? null : value });
        }}
      >
        <>
          <ComboboxTrigger
            aria-label={t('properties.lead')}
            className={PROPERTY_CONTROL_CLASS}
            id={id}
            render={<Button variant="ghost" />}
          >
            {selectedMember ? (
              <Avatar
                avatar={selectedMember.user?.avatar ?? undefined}
                size={18}
                name={
                  selectedMember.user?.fullName ||
                  selectedMember.user?.username ||
                  selectedMember.userId
                }
              />
            ) : (
              <UserRoundIcon aria-hidden size={16} />
            )}
            <span className="truncate">
              {project.leadUserId
                ? options.find((option) => option.value === project.leadUserId)?.title
                : t('properties.addLead')}
            </span>
          </ComboboxTrigger>
          <ComboboxContent className="min-w-56">
            <ComboboxInput
              aria-label={t('properties.addLead')}
              placeholder={t('properties.addLead')}
              showTrigger={false}
            />
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
  const priority = project.priority ?? 0;
  return (
    <TaskPriorityTag
      nativeButton
      disableDropdown={saving}
      priority={priority}
      onChange={(value) => void save({ priority: resolvePriorityLevel(value) })}
    >
      <Button
        aria-label={t('properties.priority')}
        className={PROPERTY_CONTROL_CLASS}
        disabled={saving}
        id={id}
        variant="ghost"
      >
        <PriorityIcon priority={priority} size={16} />
        {t(`create.priority.${priorities[priority] ?? 'noPriority'}`)}
      </Button>
    </TaskPriorityTag>
  );
}

export function ProjectDateInput({
  disabled,
  onCommit,
  precision,
  stored,
  title,
}: {
  disabled: boolean;
  onCommit: (date: Dayjs | null) => void;
  precision: ProjectDatePrecision;
  stored: { date: string | null; precision: ProjectDatePrecision };
  title: string;
}) {
  const { t } = useTranslation('project');
  const readOnly = precision !== 'day';
  const [text, setText] = useState(() =>
    stored.precision === 'day' ? formatProjectDay(stored.date) : '',
  );
  const [invalid, setInvalid] = useState(false);
  const shown = readOnly
    ? precision === stored.precision
      ? formatProjectDate(stored.date, precision)
      : ''
    : text;
  return (
    <div className="flex flex-col gap-2 px-3 pt-3 pb-2">
      <span className="text-xs text-muted-foreground">{title}</span>
      <InputGroup>
        <InputGroupInput
          autoFocus
          aria-invalid={invalid || undefined}
          aria-label={title}
          disabled={disabled}
          placeholder={t('create.dateInputPlaceholder')}
          readOnly={readOnly}
          value={shown}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => {
            setText(event.target.value);
            setInvalid(false);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || readOnly) return;
            event.preventDefault();
            const parsed = parseTypedProjectDay(text);
            if (!parsed) {
              setInvalid(true);
              return;
            }
            onCommit(parsed);
          }}
        />
        {shown && (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              aria-label={t('create.clearDate')}
              disabled={disabled}
              size="icon-xs"
              onClick={() => onCommit(null)}
            >
              <XIcon aria-hidden />
            </InputGroupButton>
          </InputGroupAddon>
        )}
      </InputGroup>
      {invalid && <span className="text-xs text-destructive">{t('create.dateInputInvalid')}</span>}
    </div>
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
  const [open, setOpen] = useState(false);
  const isStart = kind === 'startDate';
  const title = t(`create.${kind}`);
  const commit = (picked: Dayjs | null) => {
    let date = picked;
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
    setOpen(false);
    void save({
      [kind]: date?.format('YYYY-MM-DD') ?? null,
      [precisionField]: date ? precision : null,
    });
  };
  return (
    <DatePicker
      aria-label={title}
      className={cn(PROPERTY_CONTROL_CLASS, 'min-w-0 shrink')}
      disabled={saving}
      format={(date) => formatProjectDate(date.format('YYYY-MM-DD'), storedPrecision)}
      open={open}
      picker={getProjectDatePickerMode(precision)}
      placeholder={t(isStart ? 'create.start' : 'create.target')}
      prefix={<CalendarIcon aria-hidden size={16} />}
      suffixIcon={null}
      tooltip={t(project[kind] ? `create.change.${kind}` : `create.add.${kind}`)}
      value={project[kind] ? dayjs(project[kind]) : null}
      variant="ghost"
      panelRender={(panel) => (
        <>
          <ProjectDateInput
            disabled={saving}
            precision={precision}
            stored={{ date: project[kind] ?? null, precision: storedPrecision }}
            title={title}
            onCommit={commit}
          />
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
      onChange={commit}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setPrecision(storedPrecision);
      }}
    />
  );
}

export function ProjectDateFields({ project }: { project: ProjectDetail['project'] }) {
  return (
    // One line, never clipped: the controls shrink and truncate before the
    // row overflows; the 16px arrow keeps its size.
    <div className="flex min-w-0 flex-1 flex-row items-center gap-1">
      <ProjectDateField kind="startDate" project={project} />
      <ArrowRightIcon aria-hidden className="shrink-0" size={16} />
      <ProjectDateField kind="targetDate" project={project} />
    </div>
  );
}
