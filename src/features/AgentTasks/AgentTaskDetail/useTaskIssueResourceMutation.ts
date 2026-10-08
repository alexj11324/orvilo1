import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useModalContext } from '@/components/Modal';
import { openDocumentModal } from '@/features/DocumentModal/loader';
import { usePermission } from '@/hooks/usePermission';
import { mutate as refreshCache } from '@/libs/swr';
import { documentService } from '@/services/document';
import { taskService } from '@/services/task';
import { taskMenuService } from '@/services/taskMenu';
import { trpcErrorMessage } from '@/utils/trpcError';

import type { TaskIssueResourceModalProps } from './createTaskIssueResourceModal';

export const useTaskIssueResourceMutation = ({
  kind,
  taskId,
  onChanged,
}: TaskIssueResourceModalProps) => {
  const { t } = useTranslation('chat');
  const { close } = useModalContext();
  const { allowed: editable } = usePermission('create_content');
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [createdDocumentId, setCreatedDocumentId] = useState<string>();
  const [documentAttached, setDocumentAttached] = useState(false);

  const save = async (input: { title?: string; url?: string }) => {
    if (!editable || pending) return;
    setPending(true);
    setFailure(undefined);
    let documentId = createdDocumentId;
    try {
      if (kind === 'document') {
        if (!documentId) {
          const document = await documentService.createDocument({
            content: '',
            // Generic documents do not inherit a private Team's audience.
            // Keep the service's creator-private draft default until explicitly shared.
            editorData: JSON.stringify({
              root: {
                children: [],
                direction: null,
                format: '',
                indent: 0,
                type: 'root',
                version: 1,
              },
            }),
            title: input.title?.trim() || t('taskDetail.untitled'),
          });
          documentId = document.id;
          setCreatedDocumentId(documentId);
        }
        if (!documentAttached) {
          await taskService.pinDocument(taskId, documentId);
          setDocumentAttached(true);
        }
      } else {
        await taskMenuService.addLink({
          id: taskId,
          kind,
          title: input.title?.trim() || undefined,
          url: input.url?.trim() ?? '',
        });
      }
      await refreshCache(['issue-resources', taskId]);
      await onChanged();
      if (documentId) await openDocumentModal(documentId);
      close();
    } catch (caught) {
      setFailure(trpcErrorMessage(caught) ?? t('taskDetail.resources.failed'));
    } finally {
      setPending(false);
    }
  };

  return {
    close,
    createdDocumentId,
    documentAttached,
    editable,
    failure,
    pending,
    save,
    setFailure,
  };
};
