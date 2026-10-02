import { combineKeys } from '@lobehub/ui';
import { KeyEnum } from '@orvilo/const/hotkeys';
import { memo } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Kbd } from '@/components/ui/kbd';
import { useAgentId } from '@/features/ChatInput/hooks/useAgentId';
import { useUserStore } from '@/store/user';
import { preferenceSelectors } from '@/store/user/selectors';

import { useEffectiveAgentMode } from '../hooks/useEffectiveAgentMode';
import { useComposerHotkeyHint } from './useComposerHotkeyHint';

export type PlaceholderVariant = 'default' | 'followUp';

interface PlaceholderProps {
  heterogeneousName?: string;
  showAgentAssignmentHint?: boolean;
  variant?: PlaceholderVariant;
}

// Trans forwards i18n bookkeeping props to slot elements, which React.Fragment
// rejects — a component that ignores props renders nothing without warnings.
const HiddenHotkey = () => null;

const Placeholder = memo<PlaceholderProps>(
  ({ heterogeneousName, showAgentAssignmentHint = false, variant = 'default' }) => {
    const useCmdEnterToSend = useUserStore(preferenceSelectors.useCmdEnterToSend);
    const wrapperShortcut = useCmdEnterToSend
      ? KeyEnum.Enter
      : combineKeys([KeyEnum.Mod, KeyEnum.Enter]);
    const showHotkeyHint = useComposerHotkeyHint();
    const { t } = useTranslation('chat');

    const agentId = useAgentId();
    const { isAgentRuntimeMode } = useEffectiveAgentMode(agentId);

    const isHeterogeneous = !!heterogeneousName;

    if (variant === 'followUp') {
      return (
        <span>
          {t(isHeterogeneous ? 'followUpPlaceholderHeterogeneous' : 'followUpPlaceholder')}
        </span>
      );
    }

    const i18nKey = isHeterogeneous
      ? 'sendPlaceholderHeterogeneous'
      : isAgentRuntimeMode
        ? showAgentAssignmentHint
          ? 'sendPlaceholderWithAgentAssignment'
          : 'sendPlaceholder'
        : showAgentAssignmentHint
          ? 'sendPlaceholderChatWithAgentAssignment'
          : 'sendPlaceholderChat';

    return (
      <span className="flex flex-row items-center gap-1 flex-wrap">
        <Trans
          i18nKey={i18nKey}
          ns={'chat'}
          values={isHeterogeneous ? { name: heterogeneousName } : undefined}
          components={{
            hotkey: showHotkeyHint ? (
              <Trans
                i18nKey={'input.warpWithKey'}
                ns={'chat'}
                components={{
                  key: (
                    <Kbd style={{ color: 'inherit' }}>
                      {wrapperShortcut
                        .split('+')
                        .map((k) => (k === 'mod' ? '\u2318' : k))
                        .join('+')
                        .toUpperCase()}
                    </Kbd>
                  ),
                }}
              />
            ) : (
              <HiddenHotkey />
            ),
          }}
        />
        {!showAgentAssignmentHint && !isHeterogeneous && '...'}
      </span>
    );
  },
);

export default Placeholder;
