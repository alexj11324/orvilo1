import { Markdown } from '@lobehub/ui';
import { type ChatTranslate } from '@orvilo/types';
import { cssVar } from 'antd-style';
import { ChevronDown, ChevronsRight, ChevronUp, CopyIcon, TrashIcon } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import BubblesLoading from '@/components/BubblesLoading';
import { Badge } from '@/components/reui/badge';
import { toast } from '@/components/toast';
import { copyToClipboard } from '@/utils/clipboard';

import { useConversationStore } from '../../../store';

interface TranslateProps extends ChatTranslate {
  id: string;
  loading?: boolean;
}

const Translate = memo<TranslateProps>(({ content = '', from, to, id, loading }) => {
  const { t } = useTranslation('common');
  const [show, setShow] = useState(true);
  const clearTranslate = useConversationStore((s) => s.clearTranslate);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex gap-1">
            <Badge style={{ margin: 0 }}>{from ? t(`lang.${from}` as any) : '...'}</Badge>
            <ChevronsRight color={cssVar.colorTextTertiary} />
            <Badge>{t(`lang.${to}` as any)}</Badge>
          </div>
        </div>
        <div className="flex">
          <ActionIcon
            icon={CopyIcon}
            size={'small'}
            title={t('copy')}
            onClick={async () => {
              await copyToClipboard(content);
              toast.success(t('copySuccess'));
            }}
          />
          <ActionIcon
            icon={TrashIcon}
            size={'small'}
            title={t('translate.clear', { ns: 'chat' })}
            onClick={() => {
              clearTranslate(id);
            }}
          />
          <ActionIcon
            icon={show ? ChevronDown : ChevronUp}
            size={'small'}
            onClick={() => {
              setShow(!show);
            }}
          />
        </div>
      </div>
      {!show ? null : loading && !content ? (
        <BubblesLoading />
      ) : (
        <Markdown variant={'chat'}>{content}</Markdown>
      )}
    </div>
  );
});

export default Translate;
