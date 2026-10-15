'use client';

import { memo } from 'react';

import { createModal, useModalContext } from '@/components/Modal';
import { PageAgentPanelOverrideProvider } from '@/features/PageEditor/RightPanel/OverrideContext';
import PageExplorer from '@/features/PageExplorer';

import DocumentModalHeader from './Header';
import NativeDocumentModalHeader from './NativeHeader';

interface DocumentModalContentProps {
  documentId: string;
  onDeleted?: () => void;
}

const DocumentModalContent = memo<DocumentModalContentProps>(({ documentId, onDeleted }) => {
  const { close } = useModalContext();
  return (
    <PageAgentPanelOverrideProvider defaultExpand={false}>
      <PageExplorer
        fullWidthHeader
        header={<DocumentModalHeader onDeleted={onDeleted} />}
        nativeHeader={<NativeDocumentModalHeader />}
        pageId={documentId}
        onDelete={() => {
          close();
          onDeleted?.();
        }}
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
