import { cssVar } from 'antd-style';
import { t } from 'i18next';
import { ArrowLeftRight, XIcon } from 'lucide-react';
import { memo } from 'react';

import ActionIcon from '@/components/ActionIcon';
import NavHeader from '@/features/NavHeader';
import { useChatStore } from '@/store/chat';

import Title from './Title';

const Header = memo(() => {
  const [hasPortal, portalThreadId, closeThreadPortal, switchThread] = useChatStore((s) => [
    !!s.portalThreadId,
    s.portalThreadId,
    s.closeThreadPortal,
    s.switchThread,
  ]);

  return (
    <NavHeader
      left={<Title />}
      showTogglePanelButton={false}
      right={
        <div className="flex flex-row gap-1">
          {hasPortal && (
            <ActionIcon
              icon={ArrowLeftRight}
              size={'small'}
              title={t('workingPanel.tabs.swapThreads', { ns: 'chat' })}
              onClick={() => {
                if (!portalThreadId) return;

                switchThread(portalThreadId);
                closeThreadPortal();
              }}
            />
          )}
          <ActionIcon
            icon={XIcon}
            size={'small'}
            title={t('close', { ns: 'common' })}
            onClick={closeThreadPortal}
          />
        </div>
      }
      style={{
        paddingBlock: 6,
        paddingInline: 8,
        borderBottom: `1px solid ${cssVar.colorBorderSecondary}`,
      }}
    />
  );
});

export default Header;
