'use client';

import { Button, toast } from '@lobehub/ui/base-ui';
import { FileTextIcon, PlusIcon } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { agentDocumentService } from '@/services/agentDocument';

import { buildAgentDocumentPath } from '../navigation';

/**
 * Center landing for `/agent/:aid/docs` when no document is open — e.g. after
 * deleting the doc that was being viewed. The right panel keeps showing the full
 * document tree, so this is guidance + a create shortcut, not a second list.
 */
const AgentDocumentsEmpty = memo(() => {
  const { t } = useTranslation('chat');
  const { aid } = useParams<{ aid: string }>();
  const agentId = aid ?? '';
  const navigate = useWorkspaceAwareNavigate();

  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!agentId || creating) return;
    setCreating(true);
    try {
      const created = await agentDocumentService.createDocument({
        agentId,
        content: '',
        title: t('workingPanel.resources.tree.untitledDocument'),
      });
      const documentId = (created as { documentId?: string })?.documentId;
      // Fall back to staying on the index: the service already revalidated the
      // list, so the new doc shows up in the right panel for the user to open.
      if (documentId) navigate(buildAgentDocumentPath(agentId, documentId));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `${t('workingPanel.resources.tree.createError')}: ${error.message}`
          : t('workingPanel.resources.tree.createError'),
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <div
      className="flex flex-col items-center justify-center flex-1 h-full w-full"
      style={{ padding: 24 }}
    >
      <div className="flex flex-col items-center gap-4">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant={'icon'}>
              <FileTextIcon />
            </EmptyMedia>
            <EmptyTitle>{t('agentDocument.emptyTitle')}</EmptyTitle>
            <EmptyDescription>{t('agentDocument.emptyDescription')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
        <Button icon={<PlusIcon />} loading={creating} type={'primary'} onClick={handleCreate}>
          {t('workingPanel.resources.tree.newDocument')}
        </Button>
      </div>
    </div>
  );
});

AgentDocumentsEmpty.displayName = 'AgentDocumentsEmpty';

export default AgentDocumentsEmpty;
