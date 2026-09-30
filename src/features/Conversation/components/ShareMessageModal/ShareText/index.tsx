import { type UIChatMessage } from '@orvilo/types';
import { cn } from 'cn';
import isEqual from 'fast-deep-equal';
import { CopyIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useChatStore } from '@/store/chat';
import { topicSelectors } from '@/store/chat/selectors';
import { exportFile } from '@/utils/client';
import { copyToClipboard } from '@/utils/clipboard';

import { styles } from '../style';
import Preview from './Preview';
import { generateMarkdown } from './template';

interface ShareTextProps {
  item: UIChatMessage;
}

const ShareText = memo<ShareTextProps>(({ item }) => {
  const { t } = useTranslation(['chat', 'common']);

  const messages = [item];
  const topic = useChatStore(topicSelectors.currentActiveTopic, isEqual);

  const title = topic?.title || t('shareModal.exportTitle');
  const content = generateMarkdown({
    messages,
  }).replaceAll('\n\n\n', '\n');

  const isMobile = useIsMobile();

  const button = (
    <>
      <Button
        className="w-full"
        size="default"
        variant="default"
        onClick={async () => {
          await copyToClipboard(content);
          toast.success(t('copySuccess', { ns: 'common' }));
        }}
      >
        <CopyIcon data-icon="inline-start" /> {t('copy', { ns: 'common' })}
      </Button>
      <Button
        className="w-full"
        size="default"
        onClick={() => {
          exportFile(content, `${title}.md`);
        }}
      >
        {t('shareModal.downloadFile')}
      </Button>
    </>
  );

  return (
    <>
      <div className={cn('flex gap-4', styles.body)}>
        <Preview content={content} />
        <div className={cn('flex flex-col gap-3', styles.sidebar)}>{!isMobile && button}</div>
      </div>
      {isMobile && <div className={cn('flex gap-2', styles.footer)}>{button}</div>}
    </>
  );
});

export default ShareText;
