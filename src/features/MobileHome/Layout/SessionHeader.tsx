'use client';

import { ActionIcon } from '@lobehub/ui/base-ui';
import { ChatHeader } from '@lobehub/ui/mobile';
import { cx } from 'antd-style';
import { MessageSquarePlus } from 'lucide-react';
import { memo } from 'react';
import { useNavigate } from 'react-router';

import { ProductLogo } from '@/components/Branding';
import { MOBILE_HEADER_ICON_SIZE } from '@/const/layoutTokens';
import UserAvatar from '@/features/User/UserAvatar';
import { useSessionStore } from '@/store/session';
import { mobileHeaderSticky } from '@/styles/mobileHeader';

import { styles } from './SessionHeader/style';

const Header = memo(() => {
  const [createSession] = useSessionStore((s) => [s.createSession]);
  const navigate = useNavigate();

  return (
    <ChatHeader
      style={mobileHeaderSticky}
      left={
        <div className={cx(styles.leftContainer, 'flex items-center gap-2')}>
          <UserAvatar size={32} onClick={() => navigate('/me')} />
          <ProductLogo type={'text'} />
        </div>
      }
      right={
        <ActionIcon
          icon={MessageSquarePlus}
          size={MOBILE_HEADER_ICON_SIZE}
          onClick={() => createSession()}
        />
      }
    />
  );
});

export default Header;
