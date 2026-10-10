import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';

import { FILE_DATE_WIDTH, FILE_SIZE_WIDTH, getListViewMinWidth } from './ListItem/constants';

interface ListViewSkeletonProps {
  columnWidths?: {
    date: number;
    name: number;
    size: number;
    uploader: number;
  };
  count?: number;
  showUploader?: boolean;
}

const ListViewSkeleton = ({
  columnWidths = { date: FILE_DATE_WIDTH, name: 400, size: FILE_SIZE_WIDTH, uploader: 180 },
  count = 6,
  showUploader = true,
}: ListViewSkeletonProps) => {
  // Calculate opacity gradient from 100% to 20%
  const getOpacity = (index: number) => 1 - (index / (count - 1)) * 0.8;

  return (
    <div className="flex flex-col">
      {Array.from({ length: count }).map((_, index) => (
        <div
          className="flex flex-row items-center h-[48px] px-2"
          key={index}
          style={{
            background: index % 2 === 0 ? 'var(--ant-color-fill-quaternary)' : 'transparent',
            borderBlockEnd: `1px solid var(--sidebar-border)`,
            minWidth: getListViewMinWidth(showUploader),
            opacity: getOpacity(index),
          }}
        >
          <div
            className="flex flex-col items-center justify-center h-[40px]"
            style={{ paddingInline: 4 }}
          >
            <Checkbox disabled />
          </div>
          <div
            className="flex flex-row items-center"
            style={{
              flexShrink: 0,
              maxWidth: columnWidths.name,
              minWidth: columnWidths.name,
              paddingInline: 8,
              width: columnWidths.name,
            }}
          >
            <Skeleton className="size-6 rounded-full" style={{ marginInline: 8 }} />
            <Skeleton style={{ height: 16, width: '60%' }} />
          </div>
          <div
            className="flex flex-col"
            style={{ flexShrink: 0, paddingInline: '0 24px', width: columnWidths.date }}
          >
            <Skeleton style={{ height: 16, width: '80%' }} />
          </div>
          {showUploader && (
            <div
              className="flex flex-row items-center gap-2"
              style={{ flexShrink: 0, paddingInline: '0 24px', width: columnWidths.uploader }}
            >
              <Skeleton className="size-5 rounded-full" />
              <Skeleton style={{ height: 16, width: '70%' }} />
            </div>
          )}
          <div
            className="flex flex-col"
            style={{ flexShrink: 0, paddingInline: '0 24px', width: columnWidths.size }}
          >
            <Skeleton style={{ height: 16, width: '60%' }} />
          </div>
        </div>
      ))}
    </div>
  );
};

export default ListViewSkeleton;
