import { MaskShadow } from '@lobehub/ui';
import { Button } from '@lobehub/ui/base-ui';
import { useTranslation } from 'react-i18next';

import MarkdownMessage from '@/features/Conversation/Markdown';
import { useChatStore } from '@/store/chat';

interface ContentPreviewProps {
  content: string;
  id: string;
}

const ContentPreview = ({ content, id }: ContentPreviewProps) => {
  const { t } = useTranslation('chat');

  const [openMessageDetail] = useChatStore((s) => [s.openMessageDetail]);

  return (
    <div className="flex flex-col">
      <MaskShadow>
        <MarkdownMessage>{content.slice(0, 1000)}</MarkdownMessage>
      </MaskShadow>
      <div className="flex flex-col p-1">
        <Button
          block
          size={'small'}
          type={'fill'}
          onClick={() => {
            openMessageDetail(id);
          }}
        >
          {t('chatList.longMessageDetail')}
        </Button>
      </div>
    </div>
  );
};
export default ContentPreview;
