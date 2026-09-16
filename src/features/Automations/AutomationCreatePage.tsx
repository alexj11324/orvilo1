import { Flexbox, Icon, Input } from '@lobehub/ui';
import { Button, Text, TextArea, toast } from '@lobehub/ui/base-ui';
import { agentDisplayName } from '@orvilo/types';
import { Breadcrumb as AntBreadcrumb } from 'antd';
import { cssVar } from 'antd-style';
import { ChevronRight } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

import NavHeader from '@/features/NavHeader';
import WideScreenContainer from '@/features/WideScreenContainer';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { usePermission } from '@/hooks/usePermission';
import { useTaskStore } from '@/store/task';

import AssigneeAgentSelector from '../AgentTasks/features/AssigneeAgentSelector';
import AssigneeAvatar from '../AgentTasks/features/AssigneeAvatar';
import { useAgentDisplayMeta } from '../AgentTasks/shared/useAgentDisplayMeta';
import { AUTOMATION_TEMPLATES, type AutomationTemplateId } from './automationTemplates';
import AutomationTriggerDraft, { type TriggerDraft } from './AutomationTriggerDraft';
import { automationDetailPath } from './shared';

const AutomationCreatePage = memo(() => {
  const { t } = useTranslation('automation');
  const navigate = useWorkspaceAwareNavigate();
  const [searchParams] = useSearchParams();
  const { allowed: canCreate, reason } = usePermission('create_content');

  const template = useMemo(() => {
    const id = searchParams.get('template');
    return id && id in AUTOMATION_TEMPLATES
      ? AUTOMATION_TEMPLATES[id as AutomationTemplateId]
      : undefined;
  }, [searchParams]);

  // The template title lives in a lazily-loaded i18n namespace: freezing it into
  // state at mount can capture the raw key before the bundle arrives. Keep the
  // translated default derived and only store the user's own edit.
  const templateTitle = template ? t(`templates.${template.id}.title`) : '';
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const name = nameOverride ?? templateTitle;
  const [instructions, setInstructions] = useState(() => template?.prompt ?? '');
  const [assigneeAgentId, setAssigneeAgentId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TriggerDraft | null>(() =>
    template
      ? {
          kind: 'schedule',
          pattern: template.pattern,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }
      : null,
  );
  const [submitting, setSubmitting] = useState(false);
  const assigneeMeta = useAgentDisplayMeta(assigneeAgentId ?? undefined);

  const createTask = useTaskStore((s) => s.createTask);
  const updateTaskStatus = useTaskStore((s) => s.updateTaskStatus);

  const submit = useCallback(async () => {
    if (!canCreate || submitting) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error(t('create.title_required'));
      return;
    }
    if (!draft) {
      toast.error(t('create.trigger_required'));
      return;
    }
    setSubmitting(true);
    try {
      const created = await createTask({
        assigneeAgentId: assigneeAgentId ?? undefined,
        automationMode: draft.kind,
        heartbeatInterval:
          draft.kind === 'heartbeat' ? (draft.heartbeatInterval ?? 3600) : undefined,
        instruction: instructions.trim() || trimmedName,
        name: trimmedName,
        schedulePattern: draft.kind === 'schedule' ? (draft.pattern ?? undefined) : undefined,
        scheduleTimezone: draft.kind === 'schedule' ? (draft.timezone ?? undefined) : undefined,
      });
      if (created?.identifier) {
        await updateTaskStatus(created.identifier, 'scheduled');
        navigate(automationDetailPath(created.identifier), { replace: true });
      } else {
        navigate('/automations', { replace: true });
      }
    } catch {
      toast.error(t('create.submit_failed'));
      setSubmitting(false);
    }
  }, [
    canCreate,
    submitting,
    name,
    draft,
    instructions,
    assigneeAgentId,
    createTask,
    updateTaskStatus,
    navigate,
    t,
  ]);

  return (
    <Flexbox flex={1} height={'100%'}>
      <NavHeader
        styles={{ left: { paddingLeft: 4 } }}
        left={
          <AntBreadcrumb
            separator={<Icon icon={ChevronRight} />}
            items={[
              {
                title: (
                  <WorkspaceLink to={'/automations'}>
                    <Text color={'inherit'} weight={500}>
                      {t('page.title')}
                    </Text>
                  </WorkspaceLink>
                ),
              },
              {
                title: (
                  <Text color={'inherit'} weight={500}>
                    {name.trim() || t('page.new_automation')}
                  </Text>
                ),
              },
            ]}
          />
        }
        right={
          <Button
            disabled={!canCreate}
            loading={submitting}
            title={canCreate ? undefined : reason}
            type={'primary'}
            onClick={submit}
          >
            {t('create.submit')}
          </Button>
        }
      />
      <Flexbox flex={1} style={{ minHeight: 0, overflowY: 'auto' }}>
        <WideScreenContainer>
          <Flexbox gap={24} paddingBlock={16} style={{ maxWidth: 768 }}>
            <Input
              autoFocus
              placeholder={t('create.title_placeholder')}
              size={'large'}
              style={{ fontSize: 20, fontWeight: 600 }}
              value={name}
              variant={'borderless'}
              onChange={(e) => setNameOverride(e.target.value)}
            />
            <AutomationTriggerDraft draft={draft} onChange={setDraft} />
            <Flexbox gap={8}>
              <Text fontSize={13} weight={600}>
                {t('instructions.section')}
              </Text>
              <AssigneeAgentSelector
                currentAgentId={assigneeAgentId}
                onChange={(agentId) => setAssigneeAgentId(agentId)}
              >
                <Flexbox
                  horizontal
                  align={'center'}
                  gap={8}
                  style={{
                    border: `1px solid ${cssVar.colorBorderSecondary}`,
                    borderRadius: 8,
                    cursor: 'pointer',
                    paddingBlock: 6,
                    paddingInline: 10,
                    width: 'fit-content',
                  }}
                >
                  <AssigneeAvatar agentId={assigneeAgentId} size={20} />
                  <Text fontSize={13}>
                    {assigneeAgentId && assigneeMeta
                      ? agentDisplayName(assigneeMeta)
                      : t('instructions.agent_placeholder')}
                  </Text>
                </Flexbox>
              </AssigneeAgentSelector>
              <TextArea
                autoSize={{ minRows: 4 }}
                placeholder={t('create.instructions_placeholder')}
                value={instructions}
                variant={'filled'}
                onChange={(e) => setInstructions(e.target.value)}
              />
            </Flexbox>
          </Flexbox>
        </WideScreenContainer>
      </Flexbox>
    </Flexbox>
  );
});

export default AutomationCreatePage;
