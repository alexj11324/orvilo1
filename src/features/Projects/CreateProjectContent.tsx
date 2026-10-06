import type { ProjectStatus } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import dayjs, { type Dayjs } from 'dayjs';
import {
  CalendarIcon,
  ChevronRightIcon,
  GitBranchIcon,
  TagsIcon,
  UserRoundIcon,
  UsersIcon,
  XIcon,
} from 'lucide-react';
import { createElement, memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncError from '@/components/AsyncError';
import DatePicker from '@/components/DatePicker';
import EmojiPicker from '@/components/EmojiPicker';
import { ModalFooter, useModalContext } from '@/components/Modal';
import { isPriorityLevel, PriorityIcon } from '@/components/PriorityIcon';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxClear,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
} from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useWorkspaceMembersQuery } from '@/features/Teammates/api/hooks';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { type ProjectListItem, useProjectStore } from '@/store/project';

import {
  type CreateProjectDraft,
  getCreateProjectInput,
  getProjectFieldSuggestions,
  isProjectIdentifierValid,
  isProjectSlugValid,
  type ProjectDependencyType,
  type ProjectPriority,
} from './createProjectForm';
import { ProjectIcon } from './ProjectIcon';
import ProjectMilestoneEditor from './ProjectMilestoneEditor';
import {
  formatProjectDate,
  PROJECT_DATE_PRECISIONS,
  type ProjectDatePrecision,
} from './projectPlanningDate';
import { ProjectStatusIcon } from './ProjectStatusIcon';

export interface CreateProjectOptions {
  /**
   * Handle the created project instead of opening it. Callers that create a
   * project as a step of another action (filing a delivery under a new one)
   * must not have the user navigated away from what they were doing.
   */
  onCreated?: (project: ProjectListItem) => void;
  /** Workspace project labels are injected by the project taxonomy query. */
  projectLabels?: CreateProjectLabelOption[];
  /**
   * Team scope when the modal opens from a team surface — the header picker
   * starts on this team so the new project lands inside it. Still editable.
   */
  teamId?: string;
}

export interface CreateProjectLabelOption {
  color?: string;
  id: string;
  name: string;
}

interface CreateProjectFormState extends CreateProjectDraft {
  identifier: string;
  identifierEdited: boolean;
  loading: boolean;
  name: string;
  slug: string;
  slugEdited: boolean;
}

// Glyphs come from `ProjectStatusIcon`, the one renderer for project status —
// the picker must show the same mark the list row will.
const PROJECT_STATUS_OPTIONS = [
  { labelKey: 'status.backlog', value: 'backlog' },
  { labelKey: 'create.status.planned', value: 'planned' },
  { labelKey: 'create.status.inProgress', value: 'active' },
  { labelKey: 'create.status.paused', value: 'paused' },
  { labelKey: 'status.canceled', value: 'canceled' },
] as const satisfies ReadonlyArray<{
  labelKey: string;
  value: ProjectStatus;
}>;

const PROJECT_PRIORITY_OPTIONS = [
  { labelKey: 'create.priority.noPriority', value: 0 },
  { labelKey: 'create.priority.urgent', value: 1 },
  { labelKey: 'create.priority.high', value: 2 },
  { labelKey: 'create.priority.normal', value: 3 },
  { labelKey: 'create.priority.low', value: 4 },
] as const satisfies ReadonlyArray<{ labelKey: string; value: ProjectPriority }>;

const toStringValues = (value: string | string[] | null | undefined) =>
  (Array.isArray(value) ? value : value ? [value] : []).filter(
    (item): item is string => typeof item === 'string',
  );

const getDependencyValue = (type: ProjectDependencyType, projectId: string) =>
  `${type}:${projectId}`;

const parseDependencyValue = (
  value: string,
): { projectId: string; type: ProjectDependencyType } | null => {
  const separator = value.indexOf(':');
  if (separator <= 0) return null;

  const type = value.slice(0, separator);
  const projectId = value.slice(separator + 1);
  if ((type !== 'blockedBy' && type !== 'blocking') || !projectId) return null;

  return { projectId, type };
};

const styles = createStaticStyles(({ css, cssVar }) => ({
  shell: css`
    height: min(832px, calc(100dvh - 112px));
    min-height: 380px;
  `,
  header: css`
    padding-block: 20px 12px;
    padding-inline: 24px;
  `,
  body: css`
    overflow-y: auto;
    flex: 1;

    min-height: 0;
    padding-block: 0 16px;
    padding-inline: 24px;
  `,

  date: css`
    width: 88px;
    height: 24px;
    padding-block: 0;
    padding-inline: 8px;
    border-radius: 999px;

    input {
      font-size: 13px;
    }
  `,
  calendar: css`
    .ant-picker-panel-container {
      width: 304px;
    }

    .ant-picker-date-panel {
      width: 304px;
    }

    .ant-picker-header {
      padding-inline: 12px;
    }

    .ant-picker-header-view {
      order: -1;
      text-align: start;
    }

    .ant-picker-super-prev-icon,
    .ant-picker-super-next-icon {
      display: none;
    }

    .ant-picker-header-super-prev-btn,
    .ant-picker-header-super-next-btn {
      display: none;
    }

    .ant-picker-cell-inner {
      border-radius: 999px;
    }
  `,
  footer: css`
    margin: 0;
    padding-block: 12px 20px;
    padding-inline: 20px;
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};
  `,

  advanced: css`
    color: ${cssVar.colorTextSecondary};

    summary {
      cursor: pointer;
      font-size: 12px;
    }
  `,
}));

export const CreateProjectTitle = memo(() => {
  const { t } = useTranslation('project');

  return t('create.title');
});

interface ProjectDatePrecisionTabsProps {
  onChange: (precision: ProjectDatePrecision) => void;
  precision: ProjectDatePrecision;
  t: (key: `create.datePrecision.${ProjectDatePrecision}`) => string;
}

const ProjectDatePrecisionTabs = memo<ProjectDatePrecisionTabsProps>(
  ({ onChange, precision, t }) => (
    <Tabs
      value={precision}
      onValueChange={(value) => {
        if (PROJECT_DATE_PRECISIONS.includes(value as ProjectDatePrecision))
          onChange(value as ProjectDatePrecision);
      }}
    >
      <TabsList>
        {PROJECT_DATE_PRECISIONS.map((item) => (
          <TabsTrigger key={item} value={item}>
            {t(`create.datePrecision.${item}`)}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  ),
);

ProjectDatePrecisionTabs.displayName = 'ProjectDatePrecisionTabs';

const CreateProjectContent = memo<CreateProjectOptions>(
  ({ onCreated, projectLabels: suppliedLabels, teamId }) => {
    const { t } = useTranslation(['project', 'common']);
    const { close } = useModalContext();
    const navigate = useWorkspaceAwareNavigate();
    const workspaceId = useActiveWorkspaceId();
    const membersSWR = useWorkspaceMembersQuery();
    const teamsSWR = useProjectStore((s) => s.useFetchProjectTeams)();
    const projectsSWR = useProjectStore((s) => s.useFetchProjectList)(Boolean(workspaceId));
    const labelsSWR = useProjectStore((s) => s.useFetchProjectLabels)();
    const projectLabels = suppliedLabels ?? labelsSWR.data?.data ?? [];
    const createProject = useProjectStore((s) => s.createProject);
    const [labelQuery, setLabelQuery] = useState('');
    const [form, setForm] = useState<CreateProjectFormState>({
      avatar: '📦',
      dependencies: [],
      identifier: '',
      identifierEdited: false,
      labelIds: [],
      loading: false,
      memberIds: [],
      milestones: [],
      name: '',
      priority: 0,
      slug: '',
      slugEdited: false,
      startDatePrecision: 'day',
      status: 'backlog',
      targetDatePrecision: 'day',
      teamId,
      visibility: 'public',
    });
    const createInput = getCreateProjectInput(form);
    const identifierValid = isProjectIdentifierValid(form.identifier);
    const identifierInvalid =
      (form.identifierEdited || Boolean(form.name.trim())) && !identifierValid;
    const slugValid = isProjectSlugValid(form.slug);

    const projectOptions = projectsSWR.data?.data ?? [];
    const dependencyValues = (form.dependencies ?? []).map(({ projectId, type }) =>
      getDependencyValue(type, projectId),
    );
    const labelValues = [...(form.labelIds ?? []), ...(form.newLabelNames ?? [])];

    const updateDate = (
      field: 'startDate' | 'targetDate',
      precisionField: 'startDatePrecision' | 'targetDatePrecision',
      date: Dayjs | null,
      precision: ProjectDatePrecision,
    ) => {
      updateForm({
        [field]: date?.isValid() ? date.format('YYYY-MM-DD') : undefined,
        [precisionField]: precision,
      });
    };

    const updateForm = (patch: Partial<CreateProjectFormState>) => {
      setForm((current) => ({ ...current, ...patch }));
    };

    const updateName = (name: string) => {
      const suggestions = getProjectFieldSuggestions(name);
      setForm((current) => ({
        ...current,
        identifier: current.identifierEdited ? current.identifier : suggestions.identifier,
        name,
        slug: current.slugEdited ? current.slug : suggestions.slug,
      }));
    };

    const updateLabels = (value: string | string[] | null | undefined) => {
      const selected = toStringValues(value);
      const knownIds = new Set(projectLabels.map((label) => label.id));
      const knownNames = new Map(
        projectLabels.map((label) => [label.name.trim().toLowerCase(), label.id]),
      );
      const labelIds = selected
        .map((item) => knownNames.get(item.trim().toLowerCase()) ?? item)
        .filter((item) => knownIds.has(item));
      const newLabelNames = selected
        .filter((item) => !knownIds.has(item) && !knownNames.has(item.trim().toLowerCase()))
        .map((item) => item.trim())
        .filter(Boolean);
      updateForm({ labelIds, newLabelNames });
    };

    const updateDependencies = (value: string | string[] | null | undefined) => {
      const dependencies = toStringValues(value)
        .map(parseDependencyValue)
        .filter((dependency): dependency is NonNullable<typeof dependency> => dependency !== null);
      updateForm({ dependencies });
    };

    const handleCreate = async () => {
      if (!createInput || form.loading) return;
      updateForm({ loading: true });
      try {
        const project = await createProject(createInput);
        close();
        if (onCreated) onCreated(project);
        else navigate(`/project/${project.slug ?? project.id}`);
      } catch (error) {
        console.error('Failed to create project', error);
        toast.error(t('operationFailed', { ns: 'common' }));
      } finally {
        updateForm({ loading: false });
      }
    };

    const teamPickerOptions = (teamsSWR.data?.data ?? [])
      .filter((team) => team.status === 'active')
      .map((team) => ({ label: team.name, value: team.id }));
    const statusPickerOptions = PROJECT_STATUS_OPTIONS.map((option) => ({
      label: (
        <div className="flex flex-row" style={{ alignItems: 'center', gap: 6 }}>
          <ProjectStatusIcon size={13} status={option.value} />
          {t(option.labelKey)}
        </div>
      ),
      value: option.value,
    }));
    const priorityPickerOptions = PROJECT_PRIORITY_OPTIONS.map((option) => ({
      label: (
        <div className="flex flex-row" style={{ alignItems: 'center', gap: 6 }}>
          <PriorityIcon priority={option.value} size={16} />
          {t(option.labelKey)}
        </div>
      ),
      value: option.value,
    }));
    const leadPickerOptions = (membersSWR.data ?? [])
      .filter((member) => !member.deletedAt && !member.suspendedAt)
      .map((member) => ({
        label: member.user?.fullName || member.user?.username || member.userId,
        value: member.userId,
      }));
    const memberPickerOptions = (membersSWR.data ?? [])
      .filter((member) => !member.deletedAt && !member.suspendedAt)
      .map((member) => ({
        label: member.user?.fullName || member.user?.username || member.userId,
        value: member.userId,
      }));
    const labelPickerOptions = [
      ...projectLabels.map((label) => ({ label: label.name, value: label.id })),
      ...(form.newLabelNames ?? []).map((name) => ({ label: name, value: name })),
      ...(labelQuery.trim() &&
      !projectLabels.some(
        (label) => label.name.trim().toLowerCase() === labelQuery.trim().toLowerCase(),
      ) &&
      !(form.newLabelNames ?? []).includes(labelQuery.trim())
        ? [{ label: labelQuery.trim(), value: labelQuery.trim() }]
        : []),
    ];
    const dependencyPickerOptions = [
      {
        label: t('create.dependencies.yourProjects'),
        options: projectOptions.flatMap((project) => [
          {
            label: `${t('create.dependencies.blockedBy')} · ${project.name}`,
            value: getDependencyValue('blockedBy', project.id),
          },
          {
            label: `${t('create.dependencies.blocking')} · ${project.name}`,
            value: getDependencyValue('blocking', project.id),
          },
        ]),
      },
    ][0].options;
    return (
      <div className={cn('flex flex-col', styles.shell)}>
        <div
          className={cn('flex flex-row', styles.header)}
          style={{ alignItems: 'center', gap: 6 }}
        >
          {workspaceId && (
            <Combobox
              disabled={teamsSWR.isLoading}
              items={teamPickerOptions.map((option) => option.value)}
              value={form.teamId ?? null}
              itemToStringLabel={(value) => {
                const option = teamPickerOptions.find((option) => option.value === value);
                return option && 'title' in option && typeof option.title === 'string'
                  ? option.title
                  : typeof option?.label === 'string'
                    ? option.label
                    : String(value);
              }}
              onValueChange={(value) => {
                updateForm({ teamId: typeof value === 'string' ? value : undefined });
              }}
            >
              <>
                <ComboboxInput
                  aria-label={t('create.team')}
                  className="min-w-0 max-w-full"
                  disabled={teamsSWR.isLoading}
                  placeholder={t('create.team')}
                  showClear={true}
                >
                  <UsersIcon aria-hidden size={16} />
                </ComboboxInput>
                <ComboboxContent className="min-w-56">
                  <ComboboxEmpty>{t('create.team')}</ComboboxEmpty>
                  <ComboboxList>
                    {(value: (typeof teamPickerOptions)[number]['value']) => {
                      const option = teamPickerOptions.find((option) => option.value === value);
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
          )}
          {workspaceId && <ChevronRightIcon size={12} />}
          <span className="text-sm" style={{ fontSize: 13 }}>
            {t('create.title')}
          </span>
          <div className="flex flex-col" style={{ flex: 1 }} />
          <Button
            aria-label={t('close', { ns: 'common' })}
            size="icon-sm"
            variant="ghost"
            onClick={close}
          >
            {createElement(XIcon, { 'size': 16, 'aria-hidden': true })}
          </Button>
        </div>
        <div className={cn('flex flex-col', styles.body)} style={{ gap: 12 }}>
          <EmojiPicker
            allowDelete
            size={28}
            title={t('create.icon')}
            value={form.avatar || '📦'}
            customRender={(avatar) => (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 28,
                  height: 28,
                  borderRadius: 4,
                  background: cssVar.colorFillTertiary,
                  color: cssVar.colorTextSecondary,
                }}
              >
                {avatar === '📦' ? <ProjectIcon size={18} /> : avatar}
              </span>
            )}
            onChange={(avatar) => updateForm({ avatar: avatar || undefined })}
          />
          <div className="flex flex-col" style={{ gap: 8 }}>
            <Input
              autoFocus
              aria-label={t('create.nameLabel')}

              maxLength={255}
              placeholder={t('create.nameLabel')}
              value={form.name}
              onChange={(event) => updateName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) void handleCreate();
              }}
            />
            <Input
              aria-label={t('create.summary')}

              maxLength={280}
              placeholder={t('create.summaryPlaceholder')}
              value={form.summary ?? ''}
              onChange={(event) => updateForm({ summary: event.target.value })}
            />
          </div>
          <div className="flex flex-row" style={{ alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Select
              disabled={form.loading}
              value={form.visibility ?? 'public'}
              items={[
                { value: 'private', label: t('create.visibilityPrivate') },
                { value: 'public', label: t('create.visibilityPublic') },
              ]}
              onValueChange={(visibility) => {
                if (visibility === 'private' || visibility === 'public') updateForm({ visibility });
              }}
            >
              <SelectTrigger
                aria-label={t('create.visibilityLabel')}
                className="min-w-0 max-w-full"
                size="sm"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private">{t('create.visibilityPrivate')}</SelectItem>
                <SelectItem value="public">{t('create.visibilityPublic')}</SelectItem>
              </SelectContent>
            </Select>
            <Select
              disabled={false}
              items={statusPickerOptions}
              value={form.status ?? 'backlog'}
              onValueChange={(value) => {
                if (value === null) return;
                if (typeof value === 'string') updateForm({ status: value as ProjectStatus });
              }}
            >
              <SelectTrigger className="min-w-0 max-w-full" size="sm">
                <SelectValue placeholder={undefined} />
              </SelectTrigger>
              <SelectContent>
                {statusPickerOptions.map((option) => (
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
            <Select
              disabled={false}
              items={priorityPickerOptions}
              value={form.priority ?? 0}
              onValueChange={(value) => {
                if (value === null) return;
                if (isPriorityLevel(value)) updateForm({ priority: value });
              }}
            >
              <SelectTrigger className="min-w-0 max-w-full" size="sm">
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
            {workspaceId && (
              <Combobox
                disabled={membersSWR.isLoading}
                items={leadPickerOptions.map((option) => option.value)}
                value={form.leadUserId ?? null}
                itemToStringLabel={(value) => {
                  const option = leadPickerOptions.find((option) => option.value === value);
                  return option && 'title' in option && typeof option.title === 'string'
                    ? option.title
                    : typeof option?.label === 'string'
                      ? option.label
                      : String(value);
                }}
                onValueChange={(value) => {
                  updateForm({ leadUserId: typeof value === 'string' ? value : undefined });
                }}
              >
                <>
                  <ComboboxInput
                    aria-label={t('create.lead')}
                    className="min-w-0 max-w-full"
                    disabled={membersSWR.isLoading}
                    placeholder={t('create.lead')}
                    showClear={true}
                  >
                    <UserRoundIcon aria-hidden size={16} />
                  </ComboboxInput>
                  <ComboboxContent className="min-w-56">
                    <ComboboxEmpty>{t('create.lead')}</ComboboxEmpty>
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
            )}
            {workspaceId && (
              <Combobox
                multiple
                disabled={membersSWR.isLoading}
                items={memberPickerOptions.map((option) => option.value)}
                value={form.memberIds ?? []}
                itemToStringLabel={(value) => {
                  const option = memberPickerOptions.find((option) => option.value === value);
                  return option && 'title' in option && typeof option.title === 'string'
                    ? option.title
                    : typeof option?.label === 'string'
                      ? option.label
                      : String(value);
                }}
                onValueChange={(value) => {
                  updateForm({ memberIds: toStringValues(value) });
                }}
              >
                <>
                  <ComboboxChips className="min-w-0 max-w-full">
                    <UsersIcon aria-hidden size={16} />
                    {(form.memberIds ?? []).map((value) => (
                      <ComboboxChip key={value}>
                        {memberPickerOptions.find((option) => option.value === value)?.label ??
                          String(value)}
                      </ComboboxChip>
                    ))}
                    <ComboboxChipsInput
                      aria-label={t('create.members')}
                      disabled={membersSWR.isLoading}
                      placeholder={t('create.members')}
                    />
                    <ComboboxClear aria-label={t('reset', { ns: 'common' })} />
                  </ComboboxChips>
                  <ComboboxContent className="min-w-56">
                    <ComboboxEmpty>{t('create.members')}</ComboboxEmpty>
                    <ComboboxList>
                      {(value: (typeof memberPickerOptions)[number]['value']) => {
                        const option = memberPickerOptions.find((option) => option.value === value);
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
            )}
            <DatePicker
              aria-label={t('create.startDate')}
              className={styles.date}
              classNames={{ popup: { root: styles.calendar } }}
              placeholder={t('create.start')}
              prefix={<CalendarIcon size={13} />}
              size={'small'}
              suffixIcon={null}
              value={form.startDate ? dayjs(form.startDate) : null}
              format={(date) =>
                formatProjectDate(date.format('YYYY-MM-DD'), form.startDatePrecision ?? 'day')
              }
              panelRender={(panel) => (
                <>
                  <ProjectDatePrecisionTabs
                    precision={form.startDatePrecision ?? 'day'}
                    t={(key) => t(key)}
                    onChange={(precision) => updateForm({ startDatePrecision: precision })}
                  />
                  <span
                    className="text-sm"
                    style={{ fontSize: 12, display: 'block', padding: '12px 16px' }}
                  >
                    {t('create.startDate')}
                  </span>
                  {panel}
                </>
              )}
              picker={
                form.startDatePrecision === 'day'
                  ? 'date'
                  : form.startDatePrecision === 'halfYear'
                    ? 'month'
                    : form.startDatePrecision
              }
              onChange={(value) =>
                updateDate(
                  'startDate',
                  'startDatePrecision',
                  Array.isArray(value) ? (value[0] ?? null) : value,
                  form.startDatePrecision ?? 'day',
                )
              }
            />
            <DatePicker
              aria-label={t('create.targetDate')}
              className={styles.date}
              classNames={{ popup: { root: styles.calendar } }}
              placeholder={t('create.target')}
              prefix={<CalendarIcon size={13} />}
              size={'small'}
              suffixIcon={null}
              value={form.targetDate ? dayjs(form.targetDate) : null}
              format={(date) =>
                formatProjectDate(date.format('YYYY-MM-DD'), form.targetDatePrecision ?? 'day')
              }
              panelRender={(panel) => (
                <>
                  <ProjectDatePrecisionTabs
                    precision={form.targetDatePrecision ?? 'day'}
                    t={(key) => t(key)}
                    onChange={(precision) => updateForm({ targetDatePrecision: precision })}
                  />
                  <span
                    className="text-sm"
                    style={{ fontSize: 12, display: 'block', padding: '12px 16px' }}
                  >
                    {t('create.targetDate')}
                  </span>
                  {panel}
                </>
              )}
              picker={
                form.targetDatePrecision === 'day'
                  ? 'date'
                  : form.targetDatePrecision === 'halfYear'
                    ? 'month'
                    : form.targetDatePrecision
              }
              onChange={(value) =>
                updateDate(
                  'targetDate',
                  'targetDatePrecision',
                  Array.isArray(value) ? (value[0] ?? null) : value,
                  form.targetDatePrecision ?? 'day',
                )
              }
            />
            <Combobox
              autoHighlight
              multiple
              disabled={false}
              inputValue={labelQuery}
              items={labelPickerOptions.map((option) => option.value)}
              value={labelValues}
              itemToStringLabel={(value) => {
                const option = labelPickerOptions.find((option) => option.value === value);
                return option && 'title' in option && typeof option.title === 'string'
                  ? option.title
                  : typeof option?.label === 'string'
                    ? option.label
                    : String(value);
              }}
              onInputValueChange={setLabelQuery}
              onValueChange={updateLabels}
            >
              <>
                <ComboboxChips className="min-w-0 max-w-full max-w-40">
                  <TagsIcon aria-hidden size={16} />
                  {labelValues.map((value) => (
                    <ComboboxChip key={value}>
                      {labelPickerOptions.find((option) => option.value === value)?.label ??
                        String(value)}
                    </ComboboxChip>
                  ))}
                  <ComboboxChipsInput
                    aria-label={t('create.labels')}
                    disabled={false}
                    placeholder={t('create.labels')}
                  />
                  <ComboboxClear aria-label={t('reset', { ns: 'common' })} />
                </ComboboxChips>
                <ComboboxContent className="min-w-56">
                  <ComboboxEmpty>{t('create.labels')}</ComboboxEmpty>
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
            <Combobox
              multiple
              disabled={projectsSWR.isLoading}
              items={dependencyPickerOptions.map((option) => option.value)}
              value={dependencyValues}
              itemToStringLabel={(value) => {
                const option = dependencyPickerOptions.find((option) => option.value === value);
                return option && 'title' in option && typeof option.title === 'string'
                  ? option.title
                  : typeof option?.label === 'string'
                    ? option.label
                    : String(value);
              }}
              onValueChange={updateDependencies}
            >
              <>
                <ComboboxChips className="min-w-0 max-w-full">
                  <GitBranchIcon aria-hidden size={16} />
                  {dependencyValues.map((value) => (
                    <ComboboxChip key={value}>
                      {dependencyPickerOptions.find((option) => option.value === value)?.label ??
                        String(value)}
                    </ComboboxChip>
                  ))}
                  <ComboboxChipsInput
                    aria-label={t('create.dependencies.title')}
                    disabled={projectsSWR.isLoading}
                    placeholder={t('create.dependencies.title')}
                  />
                  <ComboboxClear aria-label={t('reset', { ns: 'common' })} />
                </ComboboxChips>
                <ComboboxContent className="min-w-56">
                  <ComboboxEmpty>{t('create.dependencies.title')}</ComboboxEmpty>
                  <ComboboxGroup>
                    <ComboboxLabel>{t('create.dependencies.yourProjects')}</ComboboxLabel>
                    <ComboboxList>
                      {(value: (typeof dependencyPickerOptions)[number]['value']) => {
                        const option = dependencyPickerOptions.find(
                          (option) => option.value === value,
                        );
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
                  </ComboboxGroup>
                </ComboboxContent>
              </>
            </Combobox>
          </div>
          {form.startDate && form.targetDate && form.targetDate < form.startDate && (
            <span className="text-sm text-destructive" role={'alert'}>
              {t('create.dateOrderInvalid')}
            </span>
          )}
          {teamsSWR.error && (
            <AsyncError
              error={teamsSWR.error}
              variant={'inline'}
              onRetry={() => void teamsSWR.mutate()}
            />
          )}
          {membersSWR.error && (
            <AsyncError
              error={membersSWR.error}
              variant={'inline'}
              onRetry={() => void membersSWR.mutate()}
            />
          )}
          {labelsSWR.error && (
            <AsyncError
              error={labelsSWR.error}
              variant={'inline'}
              onRetry={() => void labelsSWR.mutate()}
            />
          )}
          {projectsSWR.error && (
            <AsyncError
              error={projectsSWR.error}
              variant={'inline'}
              onRetry={() => void projectsSWR.mutate()}
            />
          )}
          <Textarea
            aria-label={t('create.description')}

            placeholder={t('create.descriptionPlaceholder')}
            style={{ flex: 1, minHeight: 120, resize: 'none' }}
            value={form.description ?? ''}
            onChange={(event) => updateForm({ description: event.target.value })}
          />
          <ProjectMilestoneEditor
            milestones={form.milestones ?? []}
            onChange={(milestones) => updateForm({ milestones })}
          />
          {(identifierInvalid || !slugValid) && (
            <span className="text-sm text-destructive" role={'alert'}>
              {t(identifierInvalid ? 'create.identifierInvalid' : 'create.slugInvalid')}
            </span>
          )}
          <details className={styles.advanced}>
            <summary>{t('create.advanced')}</summary>
            <div className="flex flex-col" style={{ gap: 12, paddingBlock: 12 }}>
              <div className="flex flex-col" style={{ gap: 4 }}>
                <span className="text-sm" style={{ fontSize: 12, fontWeight: 500 }}>
                  {t('create.identifierLabel')}
                </span>
                <Input
                  aria-invalid={(identifierInvalid ? 'error' : undefined) === 'error' || undefined}
                  maxLength={6}
                  placeholder={t('create.identifierPlaceholder')}
                  value={form.identifier}
                  onChange={(event) =>
                    updateForm({
                      identifier: event.target.value.toUpperCase(),
                      identifierEdited: true,
                    })
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.nativeEvent.isComposing)
                      void handleCreate();
                  }}
                />
                <span
                  className="text-sm"
                  style={{
                    fontSize: 12,
                    color:
                      (identifierInvalid ? 'danger' : 'secondary') === 'danger'
                        ? 'var(--destructive)'
                        : (identifierInvalid ? 'danger' : 'secondary') === 'secondary'
                          ? 'var(--muted-foreground)'
                          : undefined,
                  }}
                >
                  {t(
                    identifierInvalid ? 'create.identifierInvalid' : 'create.identifierDescription',
                  )}
                </span>
              </div>
              <div className="flex flex-col" style={{ gap: 6 }}>
                <span className="text-sm" style={{ fontSize: 13, fontWeight: 500 }}>
                  {t('create.slugLabel')}
                </span>
                <Input
                  aria-invalid={(slugValid ? undefined : 'error') === 'error' || undefined}
                  maxLength={100}
                  placeholder={t('create.slugPlaceholder')}
                  value={form.slug}
                  onChange={(event) =>
                    updateForm({ slug: event.target.value.toLowerCase(), slugEdited: true })
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.nativeEvent.isComposing)
                      void handleCreate();
                  }}
                />
                <span
                  className="text-sm"
                  style={{
                    fontSize: 12,
                    color:
                      (slugValid ? 'secondary' : 'danger') === 'danger'
                        ? 'var(--destructive)'
                        : (slugValid ? 'secondary' : 'danger') === 'secondary'
                          ? 'var(--muted-foreground)'
                          : undefined,
                  }}
                >
                  {t(slugValid ? 'create.slugDescription' : 'create.slugInvalid')}
                </span>
              </div>
            </div>
          </details>
        </div>
        <ModalFooter className={styles.footer}>
          <Button
            aria-busy={form.loading}
            disabled={!createInput || form.loading}
            size="sm"
            style={{ borderRadius: 999 }}
            variant="default"
            onClick={handleCreate}
          >
            {form.loading && <Spinner />}
            {t('create.action')}
          </Button>
        </ModalFooter>
      </div>
    );
  },
);

export default CreateProjectContent;
