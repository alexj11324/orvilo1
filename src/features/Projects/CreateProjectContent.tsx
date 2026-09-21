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
import { createStaticStyles, cssVar } from 'antd-style';
import dayjs from 'dayjs';
import {
  BoxIcon,
  CalendarIcon,
  ChevronRightIcon,
  UserRoundIcon,
  UsersIcon,
  XIcon,
} from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncError from '@/components/AsyncError';
import EmojiPicker from '@/components/EmojiPicker';
import { useWorkspaceMembersQuery } from '@/features/Teammates/api/hooks';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { type ProjectListItem, useProjectStore } from '@/store/project';

import {
  type CreateProjectDraft,
  getCreateProjectInput,
  getProjectFieldSuggestions,
  isProjectIdentifierValid,
  isProjectSlugValid,
} from './createProjectForm';

export interface CreateProjectOptions {
  /**
   * Handle the created project instead of opening it. Callers that create a
   * project as a step of another action (filing a delivery under a new one)
   * must not have the user navigated away from what they were doing.
   */
  onCreated?: (project: ProjectListItem) => void;
}

interface CreateProjectFormState extends CreateProjectDraft {
  identifier: string;
  identifierEdited: boolean;
  loading: boolean;
  name: string;
  slug: string;
  slugEdited: boolean;
}

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

    font-size: 13px;
  `,
  date: css`
    width: 112px;
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

const CreateProjectContent = memo<CreateProjectOptions>(({ onCreated }) => {
  const { t } = useTranslation(['project', 'common']);
  const { close } = useModalContext();
  const navigate = useWorkspaceAwareNavigate();
  const workspaceId = useActiveWorkspaceId();
  const membersSWR = useWorkspaceMembersQuery();
  const teamsSWR = useProjectStore((s) => s.useFetchProjectTeams)();
  const createProject = useProjectStore((s) => s.createProject);
  const [form, setForm] = useState<CreateProjectFormState>({
    avatar: '📦',
    identifier: '',
    identifierEdited: false,
    loading: false,
    name: '',
    slug: '',
    slugEdited: false,
  });
  const createInput = getCreateProjectInput(form);
  const identifierValid = isProjectIdentifierValid(form.identifier);
  const identifierInvalid =
    (form.identifierEdited || Boolean(form.name.trim())) && !identifierValid;
  const slugValid = isProjectSlugValid(form.slug);

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
              {avatar === '📦' ? <Icon icon={BoxIcon} size={18} /> : avatar}
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
          {workspaceId && (
            <>
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
            </>
          )}
          <DatePicker
            aria-label={t('create.startDate')}
            className={styles.date}
            classNames={{ popup: { root: styles.calendar } }}
            format={'MMM D'}
            placeholder={t('create.startDate')}
            prefix={<Icon icon={CalendarIcon} size={13} />}
            size={'small'}
            suffixIcon={null}
            value={form.startDate ? dayjs(form.startDate) : null}
            panelRender={(panel) => (
              <>
                <Text fontSize={12} style={{ display: 'block', padding: '12px 16px' }}>
                  {t('create.startDate')}
                </Text>
                {panel}
              </>
            )}
            onChange={(date) => updateForm({ startDate: date?.format('YYYY-MM-DD') })}
          />
          <DatePicker
            aria-label={t('create.targetDate')}
            className={styles.date}
            classNames={{ popup: { root: styles.calendar } }}
            format={'MMM D'}
            placeholder={t('create.targetDate')}
            prefix={<Icon icon={CalendarIcon} size={13} />}
            size={'small'}
            suffixIcon={null}
            value={form.targetDate ? dayjs(form.targetDate) : null}
            panelRender={(panel) => (
              <>
                <Text fontSize={12} style={{ display: 'block', padding: '12px 16px' }}>
                  {t('create.targetDate')}
                </Text>
                {panel}
              </>
            )}
            onChange={(date) => updateForm({ targetDate: date?.format('YYYY-MM-DD') })}
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
        <TextArea
          aria-label={t('create.description')}
          className={styles.description}
          placeholder={t('create.descriptionPlaceholder')}
          style={{ flex: 1, minHeight: 120, resize: 'none' }}
          value={form.description ?? ''}
          onChange={(event) => updateForm({ description: event.target.value })}
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
                {t(identifierInvalid ? 'create.identifierInvalid' : 'create.identifierDescription')}
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
});

export default CreateProjectContent;
