'use client';

import { Center } from '@lobehub/ui';
import { Button } from '@lobehub/ui/base-ui';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import NotFound from '@/components/404';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';

/**
 * The open-source default for the Agent Share settings slot.
 *
 * The route stays registered, so `/agent/:aid/share` is reachable by URL even
 * though every entry point is hidden when `useAgentShareSupported` reports
 * "not supported" — a share published earlier, a bookmark, or a pasted link
 * all still land here. Rendering nothing would answer those with a blank page,
 * which reads as a broken build rather than as a surface this deployment does
 * not offer. So the default says which of the two it is, and offers the way
 * back to the Agent.
 */
const AgentShareUnavailable = memo(() => {
  const { t } = useTranslation('agent');
  const { aid } = useParams<{ aid: string }>();
  const navigate = useWorkspaceAwareNavigate();

  return (
    <Center height={'100%'} padding={48}>
      <NotFound
        desc={t('share.unavailable.desc')}
        status={404}
        title={t('share.unavailable.title')}
        extra={
          aid ? (
            <Button type={'primary'} onClick={() => navigate(`/agent/${aid}`, { replace: true })}>
              {t('share.unavailable.action')}
            </Button>
          ) : undefined
        }
      />
    </Center>
  );
});

AgentShareUnavailable.displayName = 'AgentShareUnavailable';

export default AgentShareUnavailable;
