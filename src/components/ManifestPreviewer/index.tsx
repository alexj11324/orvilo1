import { type ReactNode } from 'react';
import { memo } from 'react';

import { CodeBlock } from '@/components/reui/code-block/code-block';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface PluginManifestPreviewerProps {
  children?: ReactNode;
  manifest: object;
  trigger?: 'click' | 'hover';
}

const ManifestPreviewer = memo<PluginManifestPreviewerProps>(
  ({ manifest, children, trigger = 'click' }) => (
    <Popover>
      <PopoverTrigger openOnHover={trigger === 'hover'} render={<span />}>
        {children}
      </PopoverTrigger>
      <PopoverContent className={'w-[400px] p-0'} side={'right'}>
        <CodeBlock
          code={JSON.stringify(manifest, null, 2)}
          language={'json'}
          style={{ maxHeight: 600, maxWidth: 400, overflow: 'scroll' }}
        />
      </PopoverContent>
    </Popover>
  ),
);

export default ManifestPreviewer;
