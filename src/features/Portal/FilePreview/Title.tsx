import { cn } from 'cn';
import { ArrowLeft } from 'lucide-react';

import ActionIcon from '@/components/ActionIcon';
import { Skeleton } from '@/components/ui/skeleton';
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
        <Skeleton style={{ height: 28 }} />
      ) : (
        <div className={cn('text-muted-foreground', oneLineEllipsis)} style={{ fontSize: 16 }}>
          {data?.name}
        </div>
      )}
    </div>
  );
};

export default Title;
