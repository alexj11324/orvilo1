import { DatePicker, Flexbox, Icon, Input, TextArea } from '@lobehub/ui';
import {
  ActionIcon,
  Button,
  ModalFooter,
  Select,
  Text,
  toast,
  useModalContext,
} from '@lobehub/ui/base-ui';
import type { ProjectStatus } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
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
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncError from '@/components/AsyncError';
import EmojiPicker from '@/components/EmojiPicker';
import { isPriorityLevel, PriorityIcon } from '@/components/PriorityIcon';
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
import { PROJECT_DATE_PRECISIONS, type ProjectDatePrecision } from './projectPlanningDate';
import { ProjectStatusIcon } from './ProjectStatusIcon';
import { useProjectDateFormatter } from './useProjectDateFormatter';

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
  property: css`
    width: auto;
    min-width: 0;
    height: 24px;
    padding-inline: 8px;
    border-radius: 999px;

    font-size: 12px;
  `,
  propertyWide: css`
    min-width: 0;
  `,
  labels: css`
    max-width: 160px;

    input {
      width: 6ch;
      min-width: 0;
    }
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

  name: css`
    padding: 0;
    border: 0;

    font-size: 24px;
    font-weight: 600;

    background: transparent;
    box-shadow: none !important;
  `,
  summary: css`
    padding: 0;
    border: 0;

    font-size: 16px;

    background: transparent;
    box-shadow: none !important;
  `,
  description: css`
    padding-block: 16px;
    padding-inline: 0;
    border: 0;
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 0;

    background: transparent;
    box-shadow: none !important;
  `,
  precisionTabs: css`
    display: flex;
    gap: 4px;
    padding-block: 8px 4px;
    padding-inline: 12px;
  `,
  precisionTab: css`
    cursor: pointer;

    padding-block: 3px;
    padding-inline: 8px;
    border: 0;
    border-radius: 9999px;

    font-size: 12px;
    color: ${cssVar.colorTextSecondary};

    background: transparent;

    &:hover {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFillTertiary};
    }
  `,
  precisionTabActive: css`
    font-weight: 500;
    color: ${cssVar.colorText};
    background: ${cssVar.colorFillSecondary};
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
    <div className={styles.precisionTabs} role="tablist">
      {PROJECT_DATE_PRECISIONS.map((item) => (
        <button
          aria-selected={item === precision}
          className={`${styles.precisionTab} ${item === precision ? styles.precisionTabActive : ''}`}
          key={item}
          role="tab"
          type="button"
          onClick={() => onChange(item)}
        >
          {t(`create.datePrecision.${item}`)}
        </button>
      ))}
    </div>
  ),
);

ProjectDatePrecisionTabs.displayName = 'ProjectDatePrecisionTabs';

const CreateProjectContent = memo<CreateProjectOptions>(
  ({ onCreated, projectLabels: suppliedLabels, teamId }) => {
    const { t } = useTranslation(['project', 'common']);
    const formatDate = useProjectDateFormatter();
    const { close } = useModalContext();
    const navigate = useWorkspaceAwareNavigate();
    const workspaceId = useActiveWorkspaceId();
    const membersSWR = useWorkspaceMembersQuery();
    const teamsSWR = useProjectStore((s) => s.useFetchProjectTeams)();
    const projectsSWR = useProjectStore((s) => s.useFetchProjectList)(Boolean(workspaceId));
    const labelsSWR = useProjectStore((s) => s.useFetchProjectLabels)();
    const projectLabels = suppliedLabels ?? labelsSWR.data?.data ?? [];
    const createProject = useProjectStore((s) => s.createProject);
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

    return (
      <Flexbox className={styles.shell}>
        <Flexbox horizontal align={'center'} className={styles.header} gap={6}>
          {workspaceId && (
            <Select
              allowClear
              showSearch
              className={styles.property}
              loading={teamsSWR.isLoading}
              placeholder={t('create.team')}
              popupMatchSelectWidth={false}
              prefix={UsersIcon}
              size={'small'}
              suffixIcon={null}
              value={form.teamId ?? null}
              options={(teamsSWR.data?.data ?? [])
                .filter((team) => team.status === 'active')
                .map((team) => ({ label: team.name, value: team.id }))}
              onChange={(value) =>
                updateForm({ teamId: typeof value === 'string' ? value : undefined })
              }
            />
          )}
          {workspaceId && <Icon icon={ChevronRightIcon} size={12} />}
          <Text fontSize={13}>{t('create.title')}</Text>
          <Flexbox flex={1} />
          <ActionIcon
            aria-label={t('close', { ns: 'common' })}
            icon={XIcon}
            size={'small'}
            onClick={close}
          />
        </Flexbox>
        <Flexbox className={styles.body} gap={12}>
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
          <Flexbox gap={8}>
            <Input
              autoFocus
              aria-label={t('create.nameLabel')}
              className={styles.name}
              maxLength={255}
              placeholder={t('create.nameLabel')}
              value={form.name}
              onChange={(event) => updateName(event.target.value)}
              onPressEnter={handleCreate}
            />
            <Input
              aria-label={t('create.summary')}
              className={styles.summary}
              maxLength={280}
              placeholder={t('create.summaryPlaceholder')}
              value={form.summary ?? ''}
              onChange={(event) => updateForm({ summary: event.target.value })}
            />
          </Flexbox>
          <Flexbox horizontal align={'center'} gap={8} wrap={'wrap'}>
            <Select
              className={styles.property}
              size={'small'}
              suffixIcon={null}
              value={form.status ?? 'backlog'}
              options={PROJECT_STATUS_OPTIONS.map((option) => ({
                label: (
                  <Flexbox horizontal align="center" gap={6}>
                    <ProjectStatusIcon size={13} status={option.value} />
                    {t(option.labelKey)}
                  </Flexbox>
                ),
                value: option.value,
              }))}
              onChange={(value) => {
                if (typeof value === 'string') updateForm({ status: value as ProjectStatus });
              }}
            />
            <Select
              className={styles.property}
              size={'small'}
              suffixIcon={null}
              value={form.priority ?? 0}
              options={PROJECT_PRIORITY_OPTIONS.map((option) => ({
                label: (
                  <Flexbox horizontal align="center" gap={6}>
                    <PriorityIcon priority={option.value} size={16} />
                    {t(option.labelKey)}
                  </Flexbox>
                ),
                value: option.value,
              }))}
              onChange={(value) => {
                if (isPriorityLevel(value)) updateForm({ priority: value });
              }}
            />
            {workspaceId && (
              <Select
                allowClear
                showSearch
                className={styles.property}
                loading={membersSWR.isLoading}
                placeholder={t('create.lead')}
                popupMatchSelectWidth={false}
                prefix={UserRoundIcon}
                size={'small'}
                suffixIcon={null}
                value={form.leadUserId ?? null}
                options={(membersSWR.data ?? [])
                  .filter((member) => !member.deletedAt && !member.suspendedAt)
                  .map((member) => ({
                    label: member.user?.fullName || member.user?.username || member.userId,
                    value: member.userId,
                  }))}
                onChange={(value) =>
                  updateForm({ leadUserId: typeof value === 'string' ? value : undefined })
                }
              />
            )}
            {workspaceId && (
              <Select
                allowClear
                showSearch
                className={`${styles.property} ${styles.propertyWide}`}
                loading={membersSWR.isLoading}
                mode={'multiple'}
                placeholder={t('create.members')}
                popupMatchSelectWidth={false}
                prefix={UsersIcon}
                size={'small'}
                suffixIcon={null}
                value={form.memberIds ?? []}
                options={(membersSWR.data ?? [])
                  .filter((member) => !member.deletedAt && !member.suspendedAt)
                  .map((member) => ({
                    label: member.user?.fullName || member.user?.username || member.userId,
                    value: member.userId,
                  }))}
                onChange={(value) => updateForm({ memberIds: toStringValues(value) })}
              />
            )}
            <DatePicker
              aria-label={t('create.startDate')}
              className={styles.date}
              classNames={{ popup: { root: styles.calendar } }}
              placeholder={t('create.start')}
              prefix={<Icon icon={CalendarIcon} size={13} />}
              size={'small'}
              suffixIcon={null}
              value={form.startDate ? dayjs(form.startDate) : null}
              format={(date) =>
                formatDate(date.format('YYYY-MM-DD'), form.startDatePrecision ?? 'day')
              }
              panelRender={(panel) => (
                <>
                  <ProjectDatePrecisionTabs
                    precision={form.startDatePrecision ?? 'day'}
                    t={(key) => t(key)}
                    onChange={(precision) => updateForm({ startDatePrecision: precision })}
                  />
                  <Text fontSize={12} style={{ display: 'block', padding: '12px 16px' }}>
                    {t('create.startDate')}
                  </Text>
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
              prefix={<Icon icon={CalendarIcon} size={13} />}
              size={'small'}
              suffixIcon={null}
              value={form.targetDate ? dayjs(form.targetDate) : null}
              format={(date) =>
                formatDate(date.format('YYYY-MM-DD'), form.targetDatePrecision ?? 'day')
              }
              panelRender={(panel) => (
                <>
                  <ProjectDatePrecisionTabs
                    precision={form.targetDatePrecision ?? 'day'}
                    t={(key) => t(key)}
                    onChange={(precision) => updateForm({ targetDatePrecision: precision })}
                  />
                  <Text fontSize={12} style={{ display: 'block', padding: '12px 16px' }}>
                    {t('create.targetDate')}
                  </Text>
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
            <Select
              allowClear
              showSearch
              className={`${styles.property} ${styles.labels}`}
              mode={'tags'}
              placeholder={t('create.labels')}
              popupMatchSelectWidth={false}
              prefix={TagsIcon}
              size={'small'}
              suffixIcon={null}
              value={labelValues}
              options={projectLabels.map((label) => ({
                label: label.name,
                value: label.id,
              }))}
              onChange={updateLabels}
            />
            <Select
              allowClear
              showSearch
              className={`${styles.property} ${styles.propertyWide}`}
              loading={projectsSWR.isLoading}
              mode={'multiple'}
              placeholder={t('create.dependencies.title')}
              popupMatchSelectWidth={false}
              prefix={GitBranchIcon}
              size={'small'}
              suffixIcon={null}
              value={dependencyValues}
              options={[
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
              ]}
              onChange={updateDependencies}
            />
          </Flexbox>
          {form.startDate && form.targetDate && form.targetDate < form.startDate && (
            <Text role={'alert'} type={'danger'}>
              {t('create.dateOrderInvalid')}
            </Text>
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
          <TextArea
            aria-label={t('create.description')}
            className={styles.description}
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
            <Text role={'alert'} type={'danger'}>
              {t(identifierInvalid ? 'create.identifierInvalid' : 'create.slugInvalid')}
            </Text>
          )}
          <details className={styles.advanced}>
            <summary>{t('create.advanced')}</summary>
            <Flexbox gap={12} paddingBlock={12}>
              <Flexbox gap={4}>
                <Text fontSize={12} weight={500}>
                  {t('create.identifierLabel')}
                </Text>
                <Input
                  maxLength={6}
                  placeholder={t('create.identifierPlaceholder')}
                  status={identifierInvalid ? 'error' : undefined}
                  value={form.identifier}
                  onPressEnter={handleCreate}
                  onChange={(event) =>
                    updateForm({
                      identifier: event.target.value.toUpperCase(),
                      identifierEdited: true,
                    })
                  }
                />
                <Text fontSize={12} type={identifierInvalid ? 'danger' : 'secondary'}>
                  {t(
                    identifierInvalid ? 'create.identifierInvalid' : 'create.identifierDescription',
                  )}
                </Text>
              </Flexbox>
              <Flexbox gap={6}>
                <Text fontSize={13} weight={500}>
                  {t('create.slugLabel')}
                </Text>
                <Input
                  maxLength={100}
                  placeholder={t('create.slugPlaceholder')}
                  status={slugValid ? undefined : 'error'}
                  value={form.slug}
                  onPressEnter={handleCreate}
                  onChange={(event) =>
                    updateForm({ slug: event.target.value.toLowerCase(), slugEdited: true })
                  }
                />
                <Text fontSize={12} type={slugValid ? 'secondary' : 'danger'}>
                  {t(slugValid ? 'create.slugDescription' : 'create.slugInvalid')}
                </Text>
              </Flexbox>
            </Flexbox>
          </details>
        </Flexbox>
        <ModalFooter className={styles.footer}>
          <Button
            disabled={!createInput}
            loading={form.loading}
            size={'small'}
            style={{ borderRadius: 999 }}
            type="primary"
            onClick={handleCreate}
          >
            {t('create.action')}
          </Button>
        </ModalFooter>
      </Flexbox>
    );
  },
);

export default CreateProjectContent;
