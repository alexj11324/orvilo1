import { type ChatInputActionsProps } from '@lobehub/editor/react';
import { ChatInputActions } from '@lobehub/editor/react';
import { type Key, memo, type ReactNode, useMemo } from 'react';

import { PromptInputTools } from '@/components/ai-elements/prompt-input';
import { Separator } from '@/components/ui/separator';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';
import { useUserStore } from '@/store/user';
import { labPreferSelectors } from '@/store/user/slices/preference/selectors';

import { type ActionKey, type ActionKeys } from '../ActionBar/config';
import { actionMap } from '../ActionBar/config';
import { useChatInputResourceAccess } from '../hooks/useChatInputResourceAccess';
import { useChatInputStore } from '../store';
import { type DropdownPlacement } from './context';
import { ActionBarContext } from './context';
import { filterChatOnlyActions } from './filterChatOnlyActions';

type ActionItem = { children?: ReactNode; key?: Key; wrapper?: (node: ReactNode) => ReactNode };

const mapActionToItem = (actionKey: ActionKey) => {
  const Render = actionMap[actionKey];

  return {
    alwaysDisplay: actionKey === 'contextWindow',
    children: <Render key={actionKey} />,
    key: actionKey,
  };
};

const mapActionsToItems = (
  keys: ActionKeys[],
  { disableCollapse = false }: { disableCollapse?: boolean } = {},
): ChatInputActionsProps['items'] =>
  keys.flatMap((actionKey, index) => {
    if (typeof actionKey === 'string') {
      if (actionKey === '---') {
        return {
          key: `divider-${index}`,
          type: 'divider',
        };
      }

      return mapActionToItem(actionKey);
    }

    if (disableCollapse) return actionKey.map(mapActionToItem);

    return {
      children: actionKey.map((groupActionKey) => mapActionToItem(groupActionKey)),
      key: `group-${index}`,
      type: 'collapse',
    };
  });

export interface ActionToolbarProps {
  borderRadius?: number;
  disableCollapse?: boolean;
  dropdownPlacement?: DropdownPlacement;
  extraActionItems?: ChatInputActionsProps['items'];
}

const ActionToolbar = memo<ActionToolbarProps>(
  ({ borderRadius, disableCollapse = false, dropdownPlacement, extraActionItems = [] }) => {
    const [expandInputActionbar, toggleExpandInputActionbar] = useGlobalStore((s) => [
      systemStatusSelectors.expandInputActionbar(s),
      s.toggleExpandInputActionbar,
    ]);
    const enableRichRender = useUserStore(labPreferSelectors.enableInputMarkdown);
    const { canConfigureResource, canShowControls } = useChatInputResourceAccess();

    const leftActions = useChatInputStore((s) => {
      const actions = s.leftActions.filter((item) => (enableRichRender ? true : item !== 'typo'));
      return canConfigureResource ? actions : filterChatOnlyActions(actions);
    });

    const mobile = useChatInputStore((s) => s.mobile);

    const items = useMemo(
      () => (mapActionsToItems(leftActions, { disableCollapse }) ?? []).concat(extraActionItems),
      [disableCollapse, extraActionItems, leftActions],
    );

    const contextValue = useMemo(
      () => ({ borderRadius, dropdownPlacement }),
      [borderRadius, dropdownPlacement],
    );

    if (!canShowControls) return null;

    return (
      <ActionBarContext value={contextValue}>
        {!mobile && disableCollapse ? (
          <PromptInputTools>
            {items?.map((item, index) =>
              item.type === 'divider' ? (
                <Separator className="mx-1 h-4" key={`divider-${index}`} orientation="vertical" />
              ) : item.type === 'collapse' ||
                item.type === 'dropdown' ||
                !(item as ActionItem).children ? (
                <ChatInputActions items={[item]} key={`extra-${index}`} />
              ) : (
                <div className="flex shrink-0 items-center" key={(item as ActionItem).key}>
                  {(item as ActionItem).wrapper?.((item as ActionItem).children) ??
                    (item as ActionItem).children}
                </div>
              ),
            )}
          </PromptInputTools>
        ) : (
          <ChatInputActions
            autoCollapse={!disableCollapse}
            collapseOffset={mobile ? 48 : 80}
            defaultGroupCollapse={!disableCollapse}
            groupCollapse={disableCollapse ? false : !expandInputActionbar}
            items={items}
            style={{ paddingLeft: 6 }}
            onGroupCollapseChange={
              disableCollapse
                ? undefined
                : (v) => {
                    toggleExpandInputActionbar(!v);
                  }
            }
          />
        )}
      </ActionBarContext>
    );
  },
);

export default ActionToolbar;
