import { Switch, Text } from '@lobehub/ui/base-ui';
import { GitBranch } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useChatStore } from '@/store/chat';
import { portalThreadSelectors } from '@/store/chat/selectors';
import { oneLineEllipsis } from '@/styles';
import { ThreadType } from '@/types/topic';

const NewThreadHeader = () => {
  const { t } = useTranslation('thread');

  const [newThreadMode] = useChatStore((s) => [portalThreadSelectors.newThreadMode(s)]);

  return (
    <div className="flex flex-row items-center gap-2" style={{ marginInlineStart: 4 }}>
      <span className="anticon" role="img">
        <GitBranch fill={'transparent'} height={18} size={18} width={18} />
      </span>
      <Text ellipsis className={oneLineEllipsis} style={{ fontSize: 14 }}>
        {t('newPortalThread.title')}
      </Text>
      <div className="flex flex-row items-center gap-2">
        <Switch
          checked={newThreadMode === ThreadType.Continuation}
          size={'small'}
          style={{ marginInlineStart: 12 }}
          onChange={(e) => {
            useChatStore.setState({
              newThreadMode: e ? ThreadType.Continuation : ThreadType.Standalone,
            });
          }}
        />
        {t('newPortalThread.includeContext')}
      </div>
    </div>
  );
};

export default NewThreadHeader;
