import { memo } from 'react';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
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
    <Sheet open={open} onOpenChange={(o) => !o && closeChunkDrawer()}>
      <SheetContent className="h-full w-[736px] gap-0 p-0 sm:max-w-[736px]" side={'right'}>
        <SheetHeader className="p-4">
          <SheetTitle>{file?.name}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-row h-[100%]" style={{ overflow: 'hidden' }}>
          {file && (
            <div className="flex flex-col" style={{ overflow: 'scroll', flex: 2 }}>
              <FileViewer {...file} id={file.fileId ?? file.id} />
            </div>
          )}
          <div
            className="flex flex-col flex-1"
            style={{ borderInlineStart: `1px solid var(--ant-color-split)` }}
          >
            <Content />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
});

export default ChunkDrawer;
