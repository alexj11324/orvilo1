'use client';

import { Text } from '@lobehub/ui/base-ui';
import type { BuiltinInterventionProps } from '@orvilo/types';
import { memo } from 'react';

import { CodeBlock } from '@/components/reui/code-block/code-block';

interface EditLocalFileParams {
  all?: boolean;
  path: string;
  replace: string;
  search: string;
}

const EditLocalFile = memo<BuiltinInterventionProps<EditLocalFileParams>>(({ args }) => {
  const { path, search, replace, all } = args;

  return (
    <div className="flex flex-col gap-2">
      <Text>
        Edit file: {path} {all && '(replace all)'}
      </Text>
      <div className="flex flex-col gap-1">
        <Text style={{ fontSize: 12 }} type={'secondary'}>
          Search:
        </Text>
        <CodeBlock
          wrap
          code={search}
          language={'text'}
          style={{ padding: '4px 8px' }}
          variant={'default'}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Text style={{ fontSize: 12 }} type={'secondary'}>
          Replace with:
        </Text>
        <CodeBlock
          wrap
          code={replace}
          language={'text'}
          style={{ padding: '4px 8px' }}
          variant={'default'}
        />
      </div>
    </div>
  );
});

export default EditLocalFile;
