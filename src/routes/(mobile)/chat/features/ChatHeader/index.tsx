'use client';

import { ChatHeader } from '@lobehub/ui/mobile';
import { memo, useState } from 'react';

import TopicCommentButton from '@/features/TopicComment/TopicCommentButton';
import { useQueryRoute } from '@/hooks/useQueryRoute';
import ShareButton from '@/routes/(main)/agent/features/Conversation/Header/ShareButton';

import ChatHeaderTitle from './ChatHeaderTitle';

const MobileHeader = memo(() => {
  const router = useQueryRoute();
  const [open, setOpen] = useState(false);

  return (
    <ChatHeader
      showBackButton
      center={<ChatHeaderTitle />}
      style={{ width: '100%' }}
      right={
        <div className="flex items-center gap-1">
          <TopicCommentButton mobile />
          <ShareButton mobile open={open} setOpen={setOpen} />
        </div>
      }
      onBackClick={() =>
        // `/agent` index redirects to `..` (mobile home / session list), preserving
        // workspace scope; the old `?session=` query was never read by the target.
        router.push('/agent', { replace: true })
      }
    />
  );
});

export default MobileHeader;
