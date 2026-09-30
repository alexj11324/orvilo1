import { Text } from '@lobehub/ui/base-ui';
import { cn } from 'cn';
import { CopyIcon } from 'lucide-react';
import { type CSSProperties } from 'react';
import { memo } from 'react';

import { Button } from '@/components/ui/button';
import { copyToClipboard } from '@/utils/clipboard';

interface CopyableLabelProps {
  className?: string;
  style?: CSSProperties;
  value?: string | null;
  wrap?: boolean;
}

const CopyableLabel = memo<CopyableLabelProps>(({ className, style, value = '--', wrap }) => {
  if (wrap) {
    return (
      <div
        className={cn('flex gap-1', className)}
        style={{ position: 'relative', width: '100%', ...style }}
      >
        <Text
          style={{
            color: 'inherit',
            flex: 1,
            fontFamily: 'inherit',
            fontSize: 'inherit',
            margin: 0,
            minWidth: 0,
            overflowWrap: 'anywhere',
            whiteSpace: 'pre-wrap',
          }}
        >
          {value || '--'}
        </Text>
        <Button
          className={'text-muted-foreground size-6'}
          size={'icon'}
          variant={'ghost'}
          onClick={async () => {
            await copyToClipboard(value || '--');
          }}
        >
          <CopyIcon size={12} />
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn('flex gap-1 items-center', className)}
      style={{ overflow: 'hidden', position: 'relative', ...style }}
    >
      <Text
        ellipsis
        style={{
          color: 'inherit',
          fontFamily: 'inherit',
          fontSize: 'inherit',
          margin: 0,
          overflow: 'hidden',
          width: '100%',
        }}
      >
        {value || '--'}
      </Text>
      <Button
        className={'text-muted-foreground size-6'}
        size={'icon'}
        variant={'ghost'}
        onClick={async () => {
          await copyToClipboard(value || '--');
        }}
      >
        <CopyIcon size={12} />
      </Button>
    </div>
  );
});

export default CopyableLabel;
