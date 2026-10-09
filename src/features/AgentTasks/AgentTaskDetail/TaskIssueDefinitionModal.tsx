import { addDays, format } from 'date-fns';
import { t as translate } from 'i18next';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { createModal, useModalContext } from '@/components/Modal';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { taskMenuService } from '@/services/taskMenu';
import { trpcErrorMessage } from '@/utils/trpcError';

import { taskDetailPath } from '../shared/taskDetailPath';

export type CreateIssueRelationKind = 'related' | 'sub_issue' | 'parent' | 'blocked' | 'blocking';
type DefinitionKind = 'copy' | 'related' | 'project' | 'template' | 'recurring';

interface DefinitionModalProps {
  expectedDomainRevision: number;
  kind: DefinitionKind;
  name?: string | null;
  onChanged: () => Promise<void>;
  relationKind?: CreateIssueRelationKind;
  taskId: string;
}

const COPY_FIELDS = [
  'includeSubIssues',
  'copyLabels',
  'copyAssignees',
  'copyDueDate',
  'copyProject',
  'copyTeam',
] as const;

/**
 * One form for the commands that create something from an issue: a copy, a
 * related issue, a project, a template or a recurring series. Every write goes
 * through `taskMenu`, carries the issue's observed revision, and never starts
 * an agent run.
 */
const TaskIssueDefinitionForm = ({
  taskId,
  expectedDomainRevision,
  name: initialName,
  kind,
  relationKind = 'related',
  onChanged,
}: DefinitionModalProps) => {
  const { t } = useTranslation(['chat', 'common']);
  const { close } = useModalContext();
  const navigate = useWorkspaceAwareNavigate();
  const inputId = useId();
  const [name, setName] = useState(kind === 'related' ? '' : (initialName ?? ''));
  const [instruction, setInstruction] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [issueName, setIssueName] = useState(initialName ?? '');
  const [dueDate, setDueDate] = useState(() => format(addDays(new Date(), 1), 'yyyy-MM-dd'));
  const [cadence, setCadence] = useState<'day' | 'week' | 'month' | 'year'>('week');
  const [interval, setInterval] = useState(1);
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [copied, setCopied] = useState<Record<(typeof COPY_FIELDS)[number], boolean>>({
    includeSubIssues: true,
    copyLabels: true,
    copyAssignees: true,
    copyDueDate: true,
    copyProject: true,
    copyTeam: true,
  });
  const [templateId, setTemplateId] = useState<string>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  // The write already committed: a failed readback is reported, never retried
  // as another write.
  const reconcile = async () => {
    try {
      await onChanged();
    } catch (failure) {
      toast.error(trpcErrorMessage(failure) ?? t('taskDetail.menu.refreshFailed'));
    }
  };

  const createFromTemplate = async () => {
    if (!templateId || pending) return;
    setPending(true);
    setError(undefined);
    try {
      const result = await taskMenuService.createFromTemplate({ templateId, name: name.trim() });
      await reconcile();
      close();
      navigate(taskDetailPath(result.data.identifier, undefined, result.data.name));
    } catch (failure) {
      setError(trpcErrorMessage(failure) ?? t('taskDetail.menu.failed'));
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (pending || templateId) return;
        setPending(true);
        setError(undefined);
        const source = { id: taskId, expectedDomainRevision };
        try {
          if (kind === 'copy') {
            const result = await taskMenuService.copyIssue({
              ...source,
              name: name.trim(),
              ...copied,
            });
            await reconcile();
            close();
            navigate(taskDetailPath(result.data.rootId));
          } else if (kind === 'related') {
            const result = await taskMenuService.createRelated({
              ...source,
              kind: relationKind,
              name: name.trim(),
              instruction,
            });
            await reconcile();
            close();
            navigate(taskDetailPath(result.data.identifier, undefined, result.data.name));
          } else if (kind === 'project') {
            const result = await taskMenuService.convertToProject({
              ...source,
              name: name.trim(),
              identifier: identifier.trim(),
              issueName: issueName.trim(),
            });
            await reconcile();
            close();
            navigate(`/project/${result.data.projectId}`);
          } else if (kind === 'template') {
            const result = await taskMenuService.convertToTemplate({
              ...source,
              name: name.trim(),
            });
            setTemplateId(result.data.id);
            await reconcile();
          } else {
            await taskMenuService.convertToRecurring({
              ...source,
              firstDueDate: dueDate,
              cadence,
              interval,
              timezone,
            });
            await reconcile();
            close();
          }
        } catch (failure) {
          setError(trpcErrorMessage(failure) ?? t('taskDetail.menu.failed'));
        } finally {
          setPending(false);
        }
      }}
    >
      {kind !== 'recurring' ? (
        <label className="flex flex-col gap-1 text-sm" htmlFor={`${inputId}-name`}>
          {t('taskDetail.menu.name')}
          <Input
            required
            disabled={pending || !!templateId}
            id={`${inputId}-name`}
            maxLength={255}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
      ) : null}
      {kind === 'related' ? (
        <label className="flex flex-col gap-1 text-sm" htmlFor={`${inputId}-description`}>
          {t('taskDetail.menu.description')}
          <Textarea
            disabled={pending}
            id={`${inputId}-description`}
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
          />
        </label>
      ) : null}
      {kind === 'copy' ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">
            {t('taskDetail.menu.copyProperties')}
          </legend>
          {COPY_FIELDS.map((field) => (
            <label
              className="flex cursor-pointer items-center gap-2 rounded-md p-2 hover:bg-accent"
              key={field}
            >
              <Checkbox
                checked={copied[field]}
                disabled={pending}
                onCheckedChange={(checked) =>
                  setCopied((previous) => ({ ...previous, [field]: checked === true }))
                }
              />
              <span className="text-sm">{t(`taskDetail.menu.copyField.${field}`)}</span>
            </label>
          ))}
        </fieldset>
      ) : null}
      {kind === 'project' ? (
        <>
          <label className="flex flex-col gap-1 text-sm" htmlFor={`${inputId}-identifier`}>
            {t('taskDetail.menu.projectIdentifier')}
            <Input
              required
              disabled={pending}
              id={`${inputId}-identifier`}
              maxLength={6}
              minLength={3}
              pattern="[A-Za-z0-9]+"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
            />
            <span className="text-xs text-muted-foreground">
              {t('taskDetail.menu.projectIdentifierHint')}
            </span>
          </label>
          <label className="flex flex-col gap-1 text-sm" htmlFor={`${inputId}-issueName`}>
            {t('taskDetail.menu.originalIssueName')}
            <Input
              required
              disabled={pending}
              id={`${inputId}-issueName`}
              maxLength={255}
              value={issueName}
              onChange={(event) => setIssueName(event.target.value)}
            />
          </label>
        </>
      ) : null}
      {kind === 'recurring' ? (
        <>
          <label className="flex flex-col gap-1 text-sm" htmlFor={`${inputId}-date`}>
            {t('taskDetail.menu.firstDueDate')}
            <Input
              required
              disabled={pending}
              id={`${inputId}-date`}
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </label>
          <fieldset>
            <legend className="mb-2 text-sm">{t('taskDetail.menu.repeatEvery')}</legend>
            <div className="flex flex-wrap gap-1">
              {(['day', 'week', 'month', 'year'] as const).map((value) => (
                <Button
                  aria-pressed={cadence === value}
                  disabled={pending}
                  key={value}
                  size="sm"
                  type="button"
                  variant={cadence === value ? 'default' : 'outline'}
                  onClick={() => setCadence(value)}
                >
                  {t(`taskDetail.menu.cadence.${value}`)}
                </Button>
              ))}
            </div>
          </fieldset>
          <label className="flex flex-col gap-1 text-sm" htmlFor={`${inputId}-interval`}>
            {t('taskDetail.menu.interval')}
            <Input
              required
              disabled={pending}
              id={`${inputId}-interval`}
              max={365}
              min={1}
              type="number"
              value={interval}
              onChange={(event) => setInterval(Number(event.target.value))}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm" htmlFor={`${inputId}-timezone`}>
            {t('taskDetail.menu.timezone')}
            <Input
              required
              disabled={pending}
              id={`${inputId}-timezone`}
              maxLength={100}
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
            />
          </label>
          <p className="text-xs text-muted-foreground">{t('taskDetail.menu.recurrenceHint')}</p>
        </>
      ) : null}
      {templateId ? (
        <p className="text-sm" role="status">
          {t('taskDetail.menu.templateSaved')}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button disabled={pending} type="button" variant="outline" onClick={close}>
          {t(templateId ? 'close' : 'cancel', { ns: 'common' })}
        </Button>
        {templateId ? (
          <Button loading={pending} type="button" onClick={() => void createFromTemplate()}>
            {t('taskDetail.menu.createFromTemplate')}
          </Button>
        ) : (
          <Button disabled={kind !== 'recurring' && !name.trim()} loading={pending} type="submit">
            {t(`taskDetail.menu.submit.${kind}`)}
          </Button>
        )}
      </div>
    </form>
  );
};

export const openTaskIssueDefinitionModal = (props: DefinitionModalProps) =>
  createModal({
    content: <TaskIssueDefinitionForm {...props} />,
    footer: null,
    title: translate(`taskDetail.menu.form.${props.kind}`, { ns: 'chat' }),
    width: 480,
  });
