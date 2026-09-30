'use client';

import { Avatar, Text } from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import isEqual from 'fast-deep-equal';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DEFAULT_AVATAR } from '@/const/index';
import { useSessionStore } from '@/store/session';
import { sessionSelectors } from '@/store/session/selectors';

import { type MarkdownElementProps } from '../type';

const styles = createStaticStyles(({ css, cssVar }) => ({
  mention: css`
    cursor: pointer;

    position: relative;

    display: inline;

    margin-inline: 0.25em;
    padding-block: 0.2em;
    padding-inline: 0.4em;
    border-radius: 0.25em;

    font-size: 0.875em;
    line-height: 1;
    color: ${cssVar.colorInfo};
    word-break: break-word;
    white-space: break-spaces;

    background: ${cssVar.colorInfoBg};

    &:hover {
      background: color-mix(in srgb, ${cssVar.colorInfo} 15%, ${cssVar.colorBgContainer});
    }
  `,
}));

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
          <div className="flex flex-col gap-3" style={{ width: 320, overflow: 'hidden' }}>
            <div className="flex items-center gap-2">
              <Avatar
                avatar={member.avatar || DEFAULT_AVATAR}
                background={member.backgroundColor ?? undefined}
                shape={'square'}
                style={{ flex: 'none' }}
              />
              <div className="flex flex-col" style={{ overflow: 'hidden' }}>
                <Text ellipsis type={'secondary'}>
                  {member.description}
                </Text>
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
