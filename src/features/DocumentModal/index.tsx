'use client';

import { memo } from 'react';

import { createModal } from '@/components/Modal';
import { PageAgentPanelOverrideProvider } from '@/features/PageEditor/RightPanel/OverrideContext';
import PageExplorer from '@/features/PageExplorer';

import DocumentModalHeader from './Header';

interface DocumentModalContentProps {
  documentId: string;
  onDeleted?: () => void;
}

const DocumentModalContent = memo<DocumentModalContentProps>(({ documentId, onDeleted }) => {
  return (
    <PageAgentPanelOverrideProvider defaultExpand={false}>
      <PageExplorer
        fullWidthHeader
        header={<DocumentModalHeader onDeleted={onDeleted} />}
        pageId={documentId}
      />
    </PageAgentPanelOverrideProvider>
  );
});

DocumentModalContent.displayName = 'DocumentModalContent';

export const createDocumentModal = (documentId: string, onDeleted?: () => void) =>
  createModal({
    content: <DocumentModalContent documentId={documentId} onDeleted={onDeleted} />,
    footer: null,
    maskClosable: true,
    styles: {
      content: {
        display: 'flex',
        height: '92vh',
        minHeight: 0,
        overflow: 'hidden',
        padding: 0,
      },
    },
    width: 'min(95vw, 1600px)',
  });
