import { agentDisplayName } from '@orvilo/types';
import { ChevronRight } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

import { toast } from '@/components/toast';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import NavHeader from '@/features/NavHeader';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { WorkSurface, WorkSurfaceDocument } from '@/features/WorkSurface';
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
  const [createdIdentifier, setCreatedIdentifier] = useState<string>();
  const configurationLocked = submitting || !!createdIdentifier;
  const assigneeMeta = useAgentDisplayMeta(assigneeAgentId ?? undefined);

  const createTask = useTaskStore((s) => s.createTask);
  const updateTaskStatus = useTaskStore((s) => s.updateTaskStatus);

  const submit = useCallback(async () => {
    if (!canCreate || submitting) return;
    const trimmedName = name.trim();
    if (!createdIdentifier) {
      if (!trimmedName) {
        toast.error(t('create.title_required'));
        return;
      }
      if (!draft) {
        toast.error(t('create.trigger_required'));
        return;
      }
    }
    setSubmitting(true);
    let taskCreated = !!createdIdentifier;
    try {
      let identifier = createdIdentifier;
      if (!identifier) {
        const created = await createTask({
          assigneeAgentId: assigneeAgentId ?? undefined,
          automationMode: draft!.kind,
          config: { schedule: { maxExecutions: draft!.maxExecutions ?? null } },
          ...(draft!.kind === 'event' ? { status: 'paused' } : {}),
          heartbeatInterval:
            draft!.kind === 'heartbeat' ? (draft!.heartbeatInterval ?? 3600) : undefined,
          instruction: instructions.trim() || trimmedName,
          name: trimmedName,
          schedulePattern: draft!.kind === 'schedule' ? (draft!.pattern ?? undefined) : undefined,
          scheduleTimezone: draft!.kind === 'schedule' ? (draft!.timezone ?? undefined) : undefined,
        });
        if (!created?.identifier) throw new Error('Task creation did not return an identifier');
        identifier = created.identifier;
        taskCreated = true;
        setCreatedIdentifier(identifier);

        // The creation response is the persisted row, not an echo of the request.
        // Keep a successful insert even if validation or enabling fails so retry
        // can never create another automation or silently discard form edits.
        const storedConfig = created.config as {
          schedule?: { maxExecutions?: number | null };
        } | null;
        const configurationMatches =
          created.name === trimmedName &&
          created.instruction === (instructions.trim() || trimmedName) &&
          created.assigneeAgentId === assigneeAgentId &&
          created.automationMode === draft!.kind &&
          (storedConfig?.schedule?.maxExecutions ?? null) === (draft!.maxExecutions ?? null) &&
          (draft!.kind === 'event' ||
            (draft!.kind === 'heartbeat'
              ? created.heartbeatInterval === (draft!.heartbeatInterval ?? 3600)
              : created.schedulePattern === draft!.pattern &&
                created.scheduleTimezone === draft!.timezone));
        if (!configurationMatches) {
          toast.error(t('create.configuration_mismatch'));
          navigate(automationDetailPath(identifier), { replace: true });
          return;
        }
      }
      if (identifier) {
        if (draft?.kind !== 'event') await updateTaskStatus(identifier, 'scheduled');
        navigate(automationDetailPath(identifier), { replace: true });
      } else {
        navigate('/automations', { replace: true });
      }
    } catch {
      toast.error(t(taskCreated ? 'create.enable_failed' : 'create.submit_failed'));
      setSubmitting(false);
    }
  }, [
    canCreate,
    createdIdentifier,
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
    <WorkSurface>
      <NavHeader
        styles={{ left: { paddingLeft: 4 } }}
        left={
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink
                  render={
                    <WorkspaceLink to={'/automations'}>
                      <div className="font-medium" style={{ color: 'inherit' }}>
                        {t('page.title')}
                      </div>
                    </WorkspaceLink>
                  }
                />
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>
                  <div className="font-medium" style={{ color: 'inherit' }}>
                    {name.trim() || t('page.new_automation')}
                  </div>
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        }
        right={
          <Button
            disabled={!canCreate}
            loading={submitting}
            title={canCreate ? undefined : reason}
            variant="outline"
            onClick={submit}
          >
            {t(
              draft?.kind === 'event'
                ? 'create.save_event_draft'
                : createdIdentifier
                  ? 'create.retry_enable'
                  : 'create.submit',
            )}
          </Button>
        }
      />
      <WorkSurfaceDocument>
        <div className="flex flex-col gap-6" style={{ maxWidth: 768 }}>
          {createdIdentifier && (
            <div className="flex flex-col items-start gap-2" role="status">
              <div className="text-muted-foreground">{t('create.saved_configuration')}</div>
              <Button
                variant="outline"
                onClick={() => navigate(automationDetailPath(createdIdentifier))}
              >
                {t('create.open_draft')}
              </Button>
            </div>
          )}
          <Input
            autoFocus
            disabled={configurationLocked}
            placeholder={t('create.title_placeholder')}
            style={{ fontSize: 20, fontWeight: 600 }}
            value={name}
            onChange={(e) => setNameOverride(e.target.value)}
          />
          <div className="flex">
            <AssigneeAgentSelector
              currentAgentId={assigneeAgentId}
              disabled={configurationLocked}
              onChange={(agentId) => setAssigneeAgentId(agentId)}
            >
              <div
                className="flex items-center gap-2"
                style={{
                  border: `1px solid var(--sidebar-border)`,
                  borderRadius: 8,
                  cursor: 'pointer',
                  paddingBlock: 6,
                  paddingInline: 10,
                  width: 'fit-content',
                }}
              >
                <AssigneeAvatar agentId={assigneeAgentId} size={20} />
                <div className="text-[13px]">
                  {assigneeAgentId && assigneeMeta
                    ? agentDisplayName(assigneeMeta)
                    : t('instructions.agent_placeholder')}
                </div>
                <ChevronRight color={'var(--ant-color-text-tertiary)'} size={14} />
              </div>
            </AssigneeAgentSelector>
          </div>
          <AutomationTriggerDraft
            disabled={configurationLocked}
            draft={draft}
            onChange={setDraft}
          />
          <div className="flex flex-col gap-2">
            <div className="text-[13px] font-semibold">{t('instructions.section')}</div>
            <Textarea
              className="min-h-[calc(4lh+0.75rem)]"
              disabled={configurationLocked}
              placeholder={t('create.instructions_placeholder')}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </div>
        </div>
      </WorkSurfaceDocument>
    </WorkSurface>
  );
});

export default AutomationCreatePage;
