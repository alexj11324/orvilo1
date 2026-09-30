import { Checkbox, Skeleton } from '@lobehub/ui/base-ui';
import { cssVar } from 'antd-style';

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
            background: index % 2 === 0 ? cssVar.colorFillQuaternary : 'transparent',
            borderBlockEnd: `1px solid ${cssVar.colorBorderSecondary}`,
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
            <Skeleton.Avatar shape={'square'} size={24} style={{ marginInline: 8 }} />
            <Skeleton height={16} width={'60%'} />
          </div>
          <div
            className="flex flex-col"
            style={{ flexShrink: 0, paddingInline: '0 24px', width: columnWidths.date }}
          >
            <Skeleton height={16} width={'80%'} />
          </div>
          {showUploader && (
            <div
              className="flex flex-row items-center gap-2"
              style={{ flexShrink: 0, paddingInline: '0 24px', width: columnWidths.uploader }}
            >
              <Skeleton.Avatar size={20} />
              <Skeleton height={16} width={'70%'} />
            </div>
          )}
          <div
            className="flex flex-col"
            style={{ flexShrink: 0, paddingInline: '0 24px', width: columnWidths.size }}
          >
            <Skeleton height={16} width={'60%'} />
          </div>
        </div>
      ))}
    </div>
  );
};

export default ListViewSkeleton;
