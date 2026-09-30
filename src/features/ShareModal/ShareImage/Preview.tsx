import { Markdown } from '@lobehub/ui';
import { agentDisplayName, type ConversationContext, type UIChatMessage } from '@orvilo/types';
import { cx } from 'antd-style';
import { memo } from 'react';

import Avatar from '@/components/Avatar';
import { ProductLogo } from '@/components/Branding';
import { ModelTag } from '@/components/OrviloIcons';
import PluginTag from '@/features/PluginTag';
import { filterToolIds } from '@/helpers/toolFilters';
import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors, agentSelectors, builtinAgentSelectors } from '@/store/agent/selectors';

import pkg from '../../../../package.json';
import { containerStyles } from '../style';
import ChatList from './ChatList';
import { styles } from './style';
import { type FieldType } from './type';
import { WidthMode } from './type';

interface PreviewProps extends FieldType {
  context: ConversationContext;
  headerAgentId?: string | null;
  messages: UIChatMessage[];
  previewId?: string;
  title?: string;
}

const Preview = memo<PreviewProps>(
  ({
    context,
    headerAgentId,
    messages,
    previewId = 'preview',
    title,
    withPluginInfo,
    withSystemRole,
    withBackground,
    withFooter,
    widthMode,
  }) => {
    const [
      currentModel,
      currentPlugins,
      systemRole,
      isInbox,
      currentTitle,
      currentAvatar,
      currentBackgroundColor,
      headerMeta,
      headerModel,
      headerPlugins,
      isHeaderInbox,
    ] = useAgentStore((s) => {
      const resolvedHeaderAgentId =
        headerAgentId && s.agentMap[headerAgentId] ? headerAgentId : undefined;

      return [
        agentSelectors.currentAgentModel(s),
        agentSelectors.displayableAgentPlugins(s),
        agentSelectors.currentAgentSystemRole(s),
        builtinAgentSelectors.isInboxAgent(s),
        agentSelectors.currentAgentDisplayName(s),
        agentSelectors.currentAgentAvatar(s),
        agentSelectors.currentAgentBackgroundColor(s),
        resolvedHeaderAgentId
          ? agentSelectors.getAgentMetaById(resolvedHeaderAgentId)(s)
          : undefined,
        resolvedHeaderAgentId
          ? agentByIdSelectors.getAgentModelById(resolvedHeaderAgentId)(s)
          : undefined,
        resolvedHeaderAgentId
          ? // Configured tools render on any viewer — the target device owns
            // the capability decision at run time.
            filterToolIds(agentByIdSelectors.getAgentPluginsById(resolvedHeaderAgentId)(s), {
              canExecuteOnDevice: true,
            })
          : undefined,
        resolvedHeaderAgentId
          ? builtinAgentSelectors.inboxAgentId(s) === resolvedHeaderAgentId
          : undefined,
      ];
    });

    const displayTitle =
      (isHeaderInbox ?? isInbox)
        ? 'Orvilo AI'
        : agentDisplayName(headerMeta) || title || currentTitle;
    const displayAvatar = headerMeta?.avatar || currentAvatar;
    const displayBackgroundColor = headerMeta?.backgroundColor || currentBackgroundColor;
    const displayModel = headerModel || currentModel;
    const displayPlugins = headerPlugins || currentPlugins;

    return (
      <div
        className={cx(
          containerStyles.preview,
          widthMode === WidthMode.Narrow
            ? containerStyles.previewNarrow
            : containerStyles.previewWide,
        )}
      >
        <div className={withBackground ? styles.background : undefined} id={previewId}>
          <div
            className={cx(
              'flex flex-col gap-4',
              cx(styles.container, withBackground && styles.container_withBackground_true),
            )}
          >
            <div className={styles.header}>
              <div className="flex flex-row items-center gap-3">
                <Avatar
                  avatar={displayAvatar}
                  background={displayBackgroundColor}
                  shape={'square'}
                  size={28}
                  title={displayTitle ?? undefined}
                />
                <div className="font-semibold text-[16px]">{displayTitle}</div>
                <div className="flex flex-row gap-1">
                  <ModelTag model={displayModel} />
                  {withPluginInfo && displayPlugins?.length > 0 && (
                    <PluginTag plugins={displayPlugins} />
                  )}
                </div>
              </div>
              {withSystemRole && systemRole && (
                <div className={styles.role}>
                  <Markdown variant={'chat'}>{systemRole}</Markdown>
                </div>
              )}
            </div>
            <ChatList context={context} ids={[]} messages={messages} />
            {withFooter ? (
              <div className={cx('flex flex-col items-center gap-1', styles.footer)}>
                <ProductLogo type={'combine'} />
                <div className={styles.url}>{pkg.homepage}</div>
              </div>
            ) : (
              <div />
            )}
          </div>
        </div>
      </div>
    );
  },
);

export default Preview;
