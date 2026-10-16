import { BRANDING_NAME } from '@orvilo/business-const';
import { useTranslation } from 'react-i18next';

import { Markdown, type MarkdownProps } from '@/components/Markdown';

const ChatPreview = ({ fontSize }: Pick<MarkdownProps, 'fontSize'>) => {
  const { t } = useTranslation('welcome');
  return (
    <div
      className={'flex min-w-0'}
      style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
    >
      <Markdown fontSize={fontSize} variant={'chat'}>
        {t('guide.defaultMessageWithoutCreate', {
          appName: BRANDING_NAME,
        })}
      </Markdown>
    </div>
  );
};

export default ChatPreview;
