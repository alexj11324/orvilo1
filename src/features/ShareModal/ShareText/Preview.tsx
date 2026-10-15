import { Markdown } from '@lobehub/ui';
import { cn } from 'cn';
import { memo } from 'react';

import { containerStyles } from '../style';

const Preview = memo<{ content: string }>(({ content }) => {
  return (
    <div className={cn(containerStyles.preview, containerStyles.previewWide, 'p-3')}>
      <Markdown fontSize={14} lineHeight={22 / 14} variant={'chat'}>
        {content}
      </Markdown>
    </div>
  );
});

export default Preview;
