'use client';

import { Skeleton, Text } from '@lobehub/ui/base-ui';
import { cx } from 'antd-style';

import { useClientDataSWR } from '@/libs/swr';
import { portalKeys } from '@/libs/swr/keys';
import { documentService } from '@/services/document';
import { oneLineEllipsis } from '@/styles';
import { getDocumentRenderMode } from '@/utils/documentRenderMode';

import AutoSaveHint from './AutoSaveHint';
import { useResolvedDocumentId } from './documentViewContext';

const Header = () => {
  const documentId = useResolvedDocumentId();

  const { data: document, isLoading } = useClientDataSWR(
    documentId ? portalKeys.documentHeader(documentId) : null,
    () => documentService.getDocumentById(documentId!),
  );

  const title = document?.filename || document?.title;
  const isReadonly = !!document && getDocumentRenderMode(document).mode === 'highlight';

  if (!documentId) return null;

  if (isLoading || !title) {
    return (
      <div className="flex flex-row items-center flex-1 gap-3 justify-between w-[100%]">
        <div className="flex flex-col flex-1">
          <Skeleton height={16} width={180} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-row items-center flex-1 gap-3 justify-between w-[100%]">
      <div className="flex flex-col flex-1">
        <Text className={cx(oneLineEllipsis)} type={'secondary'}>
          {title}
        </Text>
      </div>
      {!isReadonly && (
        <div className="flex flex-row items-center gap-2">
          <AutoSaveHint />
        </div>
      )}
    </div>
  );
};

export default Header;
