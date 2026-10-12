import { t as translate } from 'i18next';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { createModal, useModalContext } from '@/components/Modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePermission } from '@/hooks/usePermission';
import { taskMenuService } from '@/services/taskMenu';
import { trpcErrorMessage } from '@/utils/trpcError';

import { resolveResourceTitleChange } from './taskIssueResourceTitle';

interface TaskIssueResourceTitleModalProps {
  onChanged: () => Promise<unknown>;
  resource: { id: string; title: string };
  taskId: string;
}

/**
 * Rename one attached link or pull request. A failed save stays on screen with
 * its error and the typed title; the URL is not editable here.
 */
const TaskIssueResourceTitleForm = ({
  onChanged,
  resource,
  taskId,
}: TaskIssueResourceTitleModalProps) => {
  const { t } = useTranslation(['chat', 'common']);
  const { close } = useModalContext();
  const { allowed: editable } = usePermission('create_content');
  const formId = useId();
  const [title, setTitle] = useState(resource.title);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string>();
  const next = resolveResourceTitleChange(resource.title, title);

  const save = async () => {
    if (!editable || pending || !next) return;
    setPending(true);
    setFailure(undefined);
    try {
      await taskMenuService.updateLink(taskId, resource.id, next);
      await onChanged();
      close();
    } catch (caught) {
      setFailure(trpcErrorMessage(caught) ?? t('taskDetail.resources.failed'));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Input
          autoFocus
          required
          aria-label={t('taskDetail.resources.linkTitle')}
          disabled={!editable || pending}
          maxLength={255}
          placeholder={t('taskDetail.resources.linkTitle')}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </form>
      {failure ? (
        <p className="text-sm text-destructive" role="alert">
          {failure}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button disabled={pending} type="button" variant="outline" onClick={close}>
          {t('cancel', { ns: 'common' })}
        </Button>
        <Button disabled={!editable || !next} form={formId} loading={pending} type="submit">
          {t('save', { ns: 'common' })}
        </Button>
      </div>
    </div>
  );
};

export const openTaskIssueResourceTitleModal = (props: TaskIssueResourceTitleModalProps) =>
  createModal({
    content: <TaskIssueResourceTitleForm {...props} />,
    footer: null,
    title: translate('taskDetail.resources.editTitle', { ns: 'chat' }),
    width: 480,
  });
