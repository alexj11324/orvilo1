import { createStaticStyles } from 'antd-style';
import { memo } from 'react';

import { Attachments } from '@/components/ai-elements/attachments';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useChatInputStore } from '@/features/ChatInput/store';
import { fileChatSelectors, useFileStore } from '@/store/file';

import ContextItem from './ContextItem';
import ElementItem from './ElementItem';
import SelectionItem from './SelectionItem';

const styles = createStaticStyles(({ css }) => ({
  container: css`
    overflow-x: scroll;
    width: 100%;
  `,
}));

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
    <ScrollArea className={`${styles.container} [&_[data-slot=scroll-area-scrollbar]]:hidden`}>
      <Attachments className="pt-2" variant="inline">
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
    </ScrollArea>
  );
});

export default ContextList;
