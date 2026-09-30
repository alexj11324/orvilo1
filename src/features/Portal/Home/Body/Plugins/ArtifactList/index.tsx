import { cssVar } from 'antd-style';
import isEqual from 'fast-deep-equal';
import { Origami } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Balancer from 'react-wrap-balancer';

import Avatar from '@/components/Avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useChatStore } from '@/store/chat';
import { dbMessageSelectors, displayMessageSelectors } from '@/store/chat/selectors';

import ArtifactItem from './Item';

const ArtifactList = () => {
  const { t } = useTranslation('portal');
  const messages = useChatStore(dbMessageSelectors.dbToolMessages, isEqual);
  const isCurrentChatLoaded = useChatStore(displayMessageSelectors.isCurrentDisplayChatLoaded);

  return !isCurrentChatLoaded ? (
    <div className="flex flex-col gap-3 px-3">
      {[1, 1, 1, 1, 1, 1].map((key, index) => (
        <Skeleton key={`${key}-${index}`} style={{ borderRadius: 8, height: 68 }} />
      ))}
    </div>
  ) : messages.length === 0 ? (
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
            <Origami fill={'transparent'} height={'24'} size={'24'} width={'24'} />
          </span>
        }
      />
      <Balancer>
        <div className="text-muted-foreground">{t('emptyArtifactList')}</div>
      </Balancer>
    </div>
  ) : (
    <div className="flex flex-col gap-3 px-3">
      {messages.map((m) => (
        <ArtifactItem
          identifier={m.plugin?.identifier}
          key={m.id}
          messageId={m.id}
          payload={m.plugin}
        />
      ))}
    </div>
  );
};

export default ArtifactList;
