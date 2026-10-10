import { cn } from 'cn';
import { PlayIcon } from 'lucide-react';
import { memo } from 'react';

import { formatSize } from '@/utils/format';

interface VideoFileItemProps {
  isInView: boolean;
  name: string;
  size: number;
  url?: string;
}

/** Masonry card for video files: a real first-frame preview with a play badge. */
const VideoFileItem = memo<VideoFileItemProps>(({ isInView, name, size, url }) => (
  <>
    <div className="relative flex items-center justify-center w-full min-h-30 bg-fill-quaternary [&_video]:pointer-events-none [&_video]:block [&_video]:w-full [&_video]:h-auto">
      {isInView && url && (
        // The #t=0.001 media fragment forces a seek so the browser actually
        // paints the first frame; bare preload="metadata" may stay blank.
        <video muted playsInline preload={'metadata'} src={`${url}#t=0.001`} />
      )}
      <div className="absolute z-1 inset-bs-1/2 start-1/2 -translate-x-1/2 -translate-y-1/2 grid place-items-center size-11 rounded-full text-(--ant-color-text-light-solid) bg-(--ant-color-bg-mask) backdrop-blur-xs">
        <span className="anticon" role="img">
          <PlayIcon fill={'transparent'} height={20} size={20} width={20} />
        </span>
      </div>
    </div>
    <div className={cn('flex flex-col gap-1', 'p-3')}>
      <span className="truncate text-sm leading-5.5 font-semibold text-foreground">{name}</span>
      <span className="text-xs leading-5 text-muted-foreground">{formatSize(size)}</span>
    </div>
  </>
));

VideoFileItem.displayName = 'VideoFileItem';

export default VideoFileItem;
