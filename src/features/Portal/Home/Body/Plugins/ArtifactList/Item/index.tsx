import { type ChatPluginPayload } from '@orvilo/types';
import { cx } from 'antd-style';
import isEqual from 'fast-deep-equal';
import { CircuitBoard } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/reui/badge';
import PluginAvatar from '@/features/PluginAvatar';
import { useYamlArguments } from '@/hooks/useYamlArguments';
import { useChatStore } from '@/store/chat';
import { pluginHelpers, useToolStore } from '@/store/tool';
import { toolSelectors } from '@/store/tool/selectors';

import { styles } from './style';

export interface ArtifactItemProps {
  identifier?: string;
  messageId: string;
  payload?: ChatPluginPayload;
}

const ArtifactItem = memo<ArtifactItemProps>(({ payload, messageId, identifier = 'unknown' }) => {
  const { t } = useTranslation('plugin');

  const args = useYamlArguments(payload?.arguments);

  const pluginMeta = useToolStore(toolSelectors.getMetaById(identifier), isEqual);
  const isToolHasUI = useToolStore(toolSelectors.isToolHasUI(identifier));
  const openToolUI = useChatStore((s) => s.openToolUI);
  const pluginTitle = pluginHelpers.getPluginTitle(pluginMeta) ?? identifier;

  return (
    <div
      className={cx('flex flex-row items-center gap-2', styles.container)}
      onClick={() => {
        if (!isToolHasUI || !identifier) return;

        openToolUI(messageId, identifier);
      }}
    >
      <div className="flex flex-row items-center justify-between gap-6">
        <div className="flex flex-row items-center gap-2">
          <PluginAvatar identifier={identifier} />
          <div className="flex flex-col gap-1">
            <div className="flex flex-row items-center gap-2">
              <div>{pluginTitle}</div>
              <Badge variant="secondary">{payload?.apiName}</Badge>
            </div>
            <div>
              <div className="truncate min-w-0 text-muted-foreground" style={{ fontSize: 12 }}>
                {args}
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-col">
          {isToolHasUI && (
            <div className={cx(styles.tag, styles.tagBlue)} style={{ cursor: 'pointer' }} title="">
              <span className="anticon" role="img">
                <CircuitBoard fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default ArtifactItem;
