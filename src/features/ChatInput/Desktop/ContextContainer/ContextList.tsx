import { memo } from 'react';

import { Attachments } from '@/components/ai-elements/attachments';
import { useChatInputStore } from '@/features/ChatInput/store';
import { fileChatSelectors, useFileStore } from '@/store/file';

import ContextItem from './ContextItem';
import ElementItem from './ElementItem';
import SelectionItem from './SelectionItem';

const ContextList = memo(() => {
  const contextSelectionKey = useChatInputStore((s) => s.contextSelectionKey);
  const inputFilesList = useFileStore(fileChatSelectors.chatUploadFileList);
  const showFileList = useFileStore(fileChatSelectors.chatUploadFileListHasItem);
  const rawSelectionList = useFileStore(
    fileChatSelectors.chatContextSelections(contextSelectionKey),
  );
  const showSelectionList = useFileStore(
    fileChatSelectors.chatContextSelectionHasItem(contextSelectionKey),
  );

  // Filter duplicates based on preview content
  const selectionList = rawSelectionList.filter(
    (item, index, self) => index === self.findIndex((t) => t.preview === item.preview),
  );

  const hasSelections = showSelectionList && selectionList.length > 0;

  if (!showFileList && !showSelectionList) return null;
  if (inputFilesList.length === 0 && !hasSelections) return null;

  return (
    <Attachments variant="inline">
      {selectionList.map((item) =>
        item.source === 'element' ? (
          <ElementItem key={item.id} {...item} />
        ) : (
          <SelectionItem key={item.id} {...item} />
        ),
      )}
      {inputFilesList.map((item) => (
        <ContextItem key={item.id} {...item} />
      ))}
    </Attachments>
  );
});

export default ContextList;
