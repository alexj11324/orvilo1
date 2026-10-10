import type { BuiltinRenderProps } from '@orvilo/types';
import { cn } from 'cn';
import { Globe } from 'lucide-react';
import { memo } from 'react';

import type { BrowserPageState } from './types';

const styles = {
  container: 'rounded-(--radius-card) border border-divider px-2.5 py-1.5 text-sm leading-5.5',
  url: 'text-xs leading-5 text-muted-foreground',
};

/** Compact "acted on this page" row used by navigate/click/fill/press/scroll. */
const PageAction = memo<BuiltinRenderProps<unknown, BrowserPageState, string>>(
  ({ content, pluginState }) => {
    return (
      <div className={cn('flex', 'flex-col', 'gap-0.5', styles.container)}>
        <div className="flex items-center gap-1.5">
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
