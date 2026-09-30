'use client';

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
      <div>Move {operations.length} item(s):</div>
      <div className="flex flex-col gap-1">
        {operations.map((op, i) => (
          <div className="flex flex-row items-center gap-2" key={i}>
            <span
              className="font-mono rounded bg-muted px-1 truncate block text-[12px]"
              style={{ maxWidth: 200 }}
            >
              {op.source}
            </span>
            <ArrowRight size={12} />
            <span
              className="font-mono rounded bg-muted px-1 truncate block text-[12px]"
              style={{ maxWidth: 200 }}
            >
              {op.destination}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
});

export default MoveLocalFiles;
