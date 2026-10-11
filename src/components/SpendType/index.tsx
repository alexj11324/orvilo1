import { CircleDotDashed, Database, ImagePlus, MessageSquareText, Mic, Video } from 'lucide-react';
import { createElement, memo, type ReactNode } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const typeClasses: Record<SpendTypeValue, string> = {
  chat: 'text-muted-foreground',
  embedding: 'text-muted-foreground',
  imageGeneration: 'text-muted-foreground',
  speechRecognition: 'text-muted-foreground',
  videoGeneration: 'text-muted-foreground',
};

export type SpendTypeValue =
  'chat' | 'embedding' | 'imageGeneration' | 'speechRecognition' | 'videoGeneration';

interface SpendTypeProps {
  /** The readable label — shown on hover, since the cell itself is icon-only. */
  children?: ReactNode;
  type: SpendTypeValue;
}

const getIcon = (type: string) => {
  switch (type) {
    case 'chat': {
      return MessageSquareText;
    }
    case 'embedding': {
      return Database;
    }
    case 'imageGeneration': {
      return ImagePlus;
    }
    case 'speechRecognition': {
      return Mic;
    }
    case 'videoGeneration': {
      return Video;
    }
    default: {
      return CircleDotDashed;
    }
  }
};

const SpendType = memo<SpendTypeProps>(({ type, children }) => (
  <Tooltip>
    <TooltipTrigger render={<span />}>
      {createElement(getIcon(type), { size: 16, className: typeClasses[type] })}
    </TooltipTrigger>
    <TooltipContent>{children}</TooltipContent>
  </Tooltip>
));

export default SpendType;
