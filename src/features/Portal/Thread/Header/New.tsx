import { cn } from 'cn';
import { GitBranch } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Switch } from '@/components/ui/switch';
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
      <div className={cn('truncate min-w-0', oneLineEllipsis)} style={{ fontSize: 14 }}>
        {t('newPortalThread.title')}
      </div>
      <div className="flex flex-row items-center gap-2">
        <Switch
          checked={newThreadMode === ThreadType.Continuation}
          size="sm"
          style={{ marginInlineStart: 12 }}
          onCheckedChange={(e) => {
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
