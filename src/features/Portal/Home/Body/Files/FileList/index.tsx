import { Avatar, Text } from '@lobehub/ui/base-ui';
import { cssVar } from 'antd-style';
import isEqual from 'fast-deep-equal';
import { InboxIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Balancer from 'react-wrap-balancer';

import SkeletonLoading from '@/components/Loading/SkeletonLoading';
import { useChatStore } from '@/store/chat';
import { chatSelectors } from '@/store/chat/selectors';

import FileItem from './Item';

const FileList = () => {
  const { t } = useTranslation('portal');
  const files = useChatStore(chatSelectors.currentUserFiles, isEqual);
  const isCurrentChatLoaded = useChatStore(chatSelectors.isCurrentChatLoaded);

  return !isCurrentChatLoaded ? (
    <div className="flex flex-col gap-3 px-3">
      <SkeletonLoading />
    </div>
  ) : files.length === 0 ? (
    <div
      className="flex flex-col items-center justify-center gap-2 py-6"
      style={{ border: `1px dashed ${cssVar.colorSplit}`, borderRadius: 8, marginInline: 12 }}
    >
      <Avatar
        background={cssVar.colorFillTertiary}
        shape={'square'}
        size={48}
        avatar={
          <span className="anticon" role="img">
            <InboxIcon fill={'transparent'} height={'24'} size={'24'} width={'24'} />
          </span>
        }
      />
      <Balancer>
        <Text type={'secondary'}>{t('emptyKnowledgeList')}</Text>
      </Balancer>
    </div>
  ) : (
    <div className="flex flex-col gap-3 px-3">
      {files.map((m) => (
        <FileItem {...m} key={m.id} />
      ))}
    </div>
  );
};

export default FileList;
