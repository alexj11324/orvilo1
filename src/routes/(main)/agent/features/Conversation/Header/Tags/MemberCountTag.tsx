import { Tag } from '@lobehub/ui/base-ui';
import { Users } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useSessionStore } from '@/store/session';
import { sessionSelectors } from '@/store/session/selectors';
import { type OrviloGroupSession } from '@/types/session';

const MemberCountTag = memo(() => {
  const { t } = useTranslation('chat');
  const currentSession = useSessionStore(sessionSelectors.currentSession);

  const memberCount = (currentSession as OrviloGroupSession).members?.length ?? 0 + 1;

  if (memberCount < 0) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <span style={{ display: 'inline-flex' }}>
              <div className="flex flex-col" style={{ height: 22 }}>
                <Tag>
                  <Users />
                  <span>{memberCount}</span>
                </Tag>
              </div>
            </span>
          }
        />
        <TooltipContent>{t('group.memberTooltip', { count: memberCount })}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

export default MemberCountTag;
