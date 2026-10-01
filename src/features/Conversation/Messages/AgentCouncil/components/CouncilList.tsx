'use client';

import { type UIChatMessage } from '@orvilo/types';
import isEqual from 'fast-deep-equal';
import { Fragment, memo } from 'react';

import { Separator } from '@/components/ui/separator';
import { CONVERSATION_MIN_WIDTH } from '@/const/layoutTokens';
import WideScreenContainer from '@/features/WideScreenContainer';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';

import CouncilMember from './CouncilMember';
import ScrollShadowWithButton from './ScrollShadowWithButton';

export type DisplayMode = 'horizontal' | 'tab';

interface CouncilListProps {
  activeTab: number;
  displayMode?: DisplayMode;
  members?: UIChatMessage[];
}

const CouncilList = memo<CouncilListProps>(({ members, displayMode, activeTab }) => {
  const wideScreen = useGlobalStore(systemStatusSelectors.wideScreen);
  if (!members || members.length === 0) {
    return null;
  }

  switch (displayMode) {
    case 'tab': {
      const activeMember = members[activeTab];
      if (!activeMember) return null;

      return (
        <WideScreenContainer>
          <CouncilMember index={activeTab} item={activeMember} />
        </WideScreenContainer>
      );
    }

    default: {
      if (members.length < 2) {
        return (
          <WideScreenContainer className="gap-4">
            {members.map((member, idx) => {
              if (!member) return null;
              return <CouncilMember index={idx} item={member} key={member.id} />;
            })}
          </WideScreenContainer>
        );
      }
      const MIN_WIDTH = CONVERSATION_MIN_WIDTH / 2;
      return (
        <ScrollShadowWithButton justify={wideScreen ? 'flex-start' : 'center'}>
          <div
            className="flex px-4"
            style={{
              justifyContent: wideScreen ? 'flex-start' : 'center',

              minWidth: MIN_WIDTH * members.length + 32 + 32 * (members.length - 1),
            }}
          >
            {members?.map((member, idx) => {
              if (!member) return null;
              return (
                <Fragment key={member.id}>
                  <div
                    className="flex flex-col gap-3"
                    key={member.id}
                    style={{
                      width: `min(${MIN_WIDTH}px, 100%)`,

                      minWidth: MIN_WIDTH,
                      position: 'relative',
                    }}
                  >
                    <CouncilMember index={idx} item={member} />
                  </div>
                  {idx < members?.length - 1 && (
                    <Separator
                      className={'bg-transparent border-l border-dashed'}
                      orientation={'vertical'}
                      style={{ height: 'unset', marginInline: 16 }}
                    />
                  )}
                </Fragment>
              );
            })}
          </div>
        </ScrollShadowWithButton>
      );
    }
  }
}, isEqual);

export default CouncilList;
