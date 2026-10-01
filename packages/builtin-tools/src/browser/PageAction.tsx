import type { BuiltinRenderProps } from '@orvilo/types';
import { createStaticStyles } from 'antd-style';
import { cn } from 'cn';
import { Globe } from 'lucide-react';
import { memo } from 'react';

import type { BrowserPageState } from './types';

const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    padding-block: 6px;
    padding-inline: 10px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;
  `,
  url: css`
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
}));

/** Compact "acted on this page" row used by navigate/click/fill/press/scroll. */
const PageAction = memo<BuiltinRenderProps<unknown, BrowserPageState, string>>(
  ({ content, pluginState }) => {
    return (
      <div className={cn('flex', 'flex-col', 'gap-[2px]', styles.container)}>
        <div className="flex items-center gap-[6px]">
          <Globe size={14} />
          <div className="truncate">{content || pluginState?.title || 'Browser action'}</div>
        </div>
        {pluginState?.url && <div className={`truncate ${styles.url}`}>{pluginState.url}</div>}
      </div>
    );
  },
);

PageAction.displayName = 'BrowserPageAction';

export default PageAction;
