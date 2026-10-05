'use client';

import type { BuiltinRenderProps } from '@orvilo/types';
import { memo } from 'react';

import type { ReadKnowledgeArgs, ReadKnowledgeState } from '../../../types';
import FileCard from './FileCard';

const ReadKnowledge = memo<BuiltinRenderProps<ReadKnowledgeArgs, ReadKnowledgeState>>(
  ({ pluginState }) => {
    const { files } = pluginState || {};

    if (!files || files.length === 0) {
      return null;
    }

    return (
      <div className="flex flex-row gap-3" style={{ flexWrap: 'wrap' }}>
        {files.map((file) => (
          <FileCard file={file} key={file.fileId} />
        ))}
      </div>
    );
  },
);

export default ReadKnowledge;
