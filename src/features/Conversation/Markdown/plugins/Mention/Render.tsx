'use client';

import isEqual from 'fast-deep-equal';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DEFAULT_AVATAR } from '@/const/index';
import { useSessionStore } from '@/store/session';
import { sessionSelectors } from '@/store/session/selectors';

import { type MarkdownElementProps } from '../type';

const styles = {
  mention:
    'relative inline cursor-pointer mx-1 py-0.5 px-1.5 rounded-(--radius-chip) text-sm leading-5.5 text-info-text [word-break:break-word] whitespace-break-spaces bg-info-wash hover:bg-[color-mix(in_srgb,var(--info)_15%,var(--card))]',
};

interface MentionProps {
  id: string;
  name: string;
}
const Render = memo<MarkdownElementProps<MentionProps>>(({ children, node }) => {
  const { id: mentionId, name } = node?.properties || {};
  const { t } = useTranslation('chat');

  const currentGroupMembers = useSessionStore(sessionSelectors.currentGroupAgents, isEqual);

  // Handle "ALL_MEMBERS" special case
  if (mentionId === 'ALL_MEMBERS') {
    return (
      <span className={styles.mention}>
        {'@'}
        {t('memberSelection.allMembers')}
      </span>
    );
  }

  // Find the specific member
  const member = currentGroupMembers?.find((m) => m.id === mentionId);

  if (!member) {
    // Fallback for unknown member
    return (
      <span className={styles.mention}>
        {'@'}
        {name || children || 'unknown'}
      </span>
    );
  }

  return (
    <Popover>
      <PopoverContent>
        {
          <div className="flex w-80 flex-col gap-3 overflow-hidden">
            <div className="flex items-center gap-2">
              <Avatar
                avatar={member.avatar || DEFAULT_AVATAR}
                background={member.backgroundColor ?? undefined}
                className="flex-none"
                shape={'square'}
              />
              <div className="flex flex-col overflow-hidden">
                <div className="truncate text-sm leading-5.5 text-muted-foreground">
                  {member.description}
                </div>
              </div>
            </div>
          </div>
        }
      </PopoverContent>
      <PopoverTrigger
        render={
          <span className={styles.mention}>
            {'@'}
            {member.title || name || children}
          </span>
        }
      />
    </Popover>
  );
});

Render.displayName = 'MentionRender';

export default Render;
