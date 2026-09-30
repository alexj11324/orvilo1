'use client';

import { Text } from '@lobehub/ui/base-ui';
import type { BuiltinInterventionProps } from '@orvilo/types';
import { ArrowRight } from 'lucide-react';
import { memo } from 'react';

interface MoveLocalFilesParams {
  operations: Array<{ destination: string; source: string }>;
}

const MoveLocalFiles = memo<BuiltinInterventionProps<MoveLocalFilesParams>>(({ args }) => {
  const { operations } = args;

  return (
    <div className="flex flex-col gap-2">
      <Text>Move {operations.length} item(s):</Text>
      <div className="flex flex-col gap-1">
        {operations.map((op, i) => (
          <div className="flex flex-row items-center gap-2" key={i}>
            <Text code ellipsis as={'span'} fontSize={12} style={{ maxWidth: 200 }}>
              {op.source}
            </Text>
            <ArrowRight size={12} />
            <Text code ellipsis as={'span'} fontSize={12} style={{ maxWidth: 200 }}>
              {op.destination}
            </Text>
          </div>
        ))}
      </div>
    </div>
  );
});

export default MoveLocalFiles;
