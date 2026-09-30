import { type IThreadType, ThreadType } from '@orvilo/types';
import { cssVar } from 'antd-style';
import { GitBranch } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Separator } from '@/components/ui/separator';

interface ThreadDividerProps {
  threadType?: IThreadType;
}

/**
 * Sits under the fork message — the only main-chat message rendered in the
 * thread portal — and states what context the thread carries: a standalone
 * thread inherits just that message, everything else continues with the main
 * chat history up to it.
 */
const ThreadDivider = memo<ThreadDividerProps>(({ threadType }) => {
  const { t } = useTranslation('chat');

  return (
    <div style={{ padding: '0 20px' }}>
      <Separator style={{ margin: 0, padding: '20px 0' }}>
        <div
          className="flex flex-row items-center gap-1.5"
          style={{ color: cssVar.colorTextDescription, fontSize: 12 }}
        >
          <span className="anticon" role="img">
            <GitBranch fill={'transparent'} height={12} size={12} width={12} />
          </span>
          {threadType === ThreadType.Standalone
            ? t('thread.dividerStandalone')
            : t('thread.dividerContinuation')}
        </div>
      </Separator>
    </div>
  );
});

export default ThreadDivider;
