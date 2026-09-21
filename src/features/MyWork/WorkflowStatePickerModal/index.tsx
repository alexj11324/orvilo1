'use client';

import { createModal } from '@lobehub/ui/base-ui';
import type { TaskWorkflowCategory } from '@orvilo/types';

import { WorkflowStatePickerContent } from './WorkflowStatePickerContent';

export const createWorkflowStatePickerModal = (params: {
  category: TaskWorkflowCategory;
  teamId: string;
}): Promise<string | null> =>
  new Promise((resolve) => {
    let picked: string | null = null;
    createModal({
      content: (
        <WorkflowStatePickerContent
          category={params.category}
          teamId={params.teamId}
          onCancel={() => resolve(null)}
          onPick={(workflowStateRefId) => {
            picked = workflowStateRefId;
            resolve(workflowStateRefId);
          }}
        />
      ),
      footer: null,
      maskClosable: true,
      onOpenChangeComplete: (open) => {
        if (!open && !picked) resolve(null);
      },
      styles: { content: { padding: 0 } },
      title: false,
      width: 'min(92vw, 420px)',
    });
  });
