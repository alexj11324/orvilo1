import { cn } from 'cn';
import { AudioLinesIcon } from 'lucide-react';
import { memo } from 'react';

import { formatSize } from '@/utils/format';

interface AudioFileItemProps {
  isInView: boolean;
  name: string;
  size: number;
  url?: string;
}

/** Masonry card for audio files: type cover plus an inline playable control. */
const AudioFileItem = memo<AudioFileItemProps>(({ isInView, name, size, url }) => (
  <>
    <div className="flex items-center justify-center w-full py-7 text-muted-foreground bg-fill-quaternary">
      <span className="anticon" role="img">
        <AudioLinesIcon fill={'transparent'} height={40} size={40} width={40} />
      </span>
    </div>
    <div className={cn('flex flex-col gap-2', 'p-3')}>
      <span className="truncate text-sm leading-5.5 font-semibold text-foreground">{name}</span>
      <span className="text-xs leading-5 text-muted-foreground">{formatSize(size)}</span>
      {isInView && url && (
        // controls stay interactive without triggering the card's open action
        <audio
          controls
          className="w-full h-8 [&::-webkit-media-controls-panel]:bg-fill-quaternary"
          preload={'metadata'}
          src={url}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        />
      )}
    </div>
  </>
));

AudioFileItem.displayName = 'AudioFileItem';

export default AudioFileItem;
