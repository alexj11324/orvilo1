import { t } from 'i18next';
import { XIcon } from 'lucide-react';
import { memo } from 'react';

import ActionIcon from '@/components/ActionIcon';
import NavHeader from '@/features/NavHeader';
import { useChatStore } from '@/store/chat';

import Title from './Title';

const Header = memo(() => {
  const closeTopicPortal = useChatStore((s) => s.closeTopicPortal);

  return (
    <NavHeader
      left={<Title />}
      showTogglePanelButton={false}
      right={
        <ActionIcon
          icon={XIcon}
          size={'small'}
          title={t('close', { ns: 'common' })}
          onClick={closeTopicPortal}
        />
      }
      style={{
        paddingBlock: 6,
        paddingInline: 8,
        borderBottom: `1px solid ${'var(--ant-color-border-secondary)'}`,
      }}
    />
  );
});

export default Header;
