import { Drawer } from '@lobehub/ui/base-ui';
import { cssVar } from 'antd-style';
import { memo } from 'react';

import dynamic from '@/libs/next/dynamic';
import { fileManagerSelectors, useFileStore } from '@/store/file';

import Content from './Content';

const FileViewer = dynamic(() => import('@/features/FileViewer'), { ssr: false });

/**
 * Showing the chunk info of a file
 */
const ChunkDrawer = memo(() => {
  const [fileId, open, closeChunkDrawer] = useFileStore((s) => [
    s.chunkDetailId,
    !!s.chunkDetailId,
    s.closeChunkDrawer,
  ]);
  const file = useFileStore(fileManagerSelectors.getFileByChunkTargetId(fileId));

  return (
    <Drawer
      open={open}
      title={file?.name}
      width={736}
      styles={{
        bodyContent: { height: '100%', padding: 0 },
      }}
      onClose={() => {
        closeChunkDrawer();
      }}
    >
      <div className="flex flex-row h-[100%]" style={{ overflow: 'hidden' }}>
        {file && (
          <div className="flex flex-col" style={{ overflow: 'scroll', flex: 2 }}>
            <FileViewer {...file} id={file.fileId ?? file.id} />
          </div>
        )}
        <div
          className="flex flex-col flex-1"
          style={{ borderInlineStart: `1px solid ${cssVar.colorSplit}` }}
        >
          <Content />
        </div>
      </div>
    </Drawer>
  );
});

export default ChunkDrawer;
