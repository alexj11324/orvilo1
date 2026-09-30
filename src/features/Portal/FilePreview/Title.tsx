import { ActionIcon, Skeleton, Text } from '@lobehub/ui/base-ui';
import { ArrowLeft } from 'lucide-react';

import { useChatStore } from '@/store/chat';
import { chatPortalSelectors } from '@/store/chat/selectors';
import { useFileStore } from '@/store/file';
import { oneLineEllipsis } from '@/styles';

const Title = () => {
  const [closeFilePreview, previewFileId] = useChatStore((s) => [
    s.closeFilePreview,
    chatPortalSelectors.previewFileId(s),
  ]);

  const useFetchFileItem = useFileStore((s) => s.useFetchKnowledgeItem);

  const { data, isLoading } = useFetchFileItem(previewFileId);

  return (
    <div className="flex flex-row items-center gap-1">
      <ActionIcon icon={ArrowLeft} size={'small'} onClick={() => closeFilePreview()} />

      {isLoading ? (
        <Skeleton height={28} />
      ) : (
        <Text className={oneLineEllipsis} style={{ fontSize: 16 }} type={'secondary'}>
          {data?.name}
        </Text>
      )}
    </div>
  );
};

export default Title;
