import { MaskShadow } from '@lobehub/ui';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
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
          className="w-full"
          size="sm"
          variant="secondary"
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
