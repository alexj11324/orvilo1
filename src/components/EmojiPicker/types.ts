import type { CSSProperties, ReactNode } from 'react';

import type { AvatarProps } from '@/components/Avatar';

export interface CustomEmojiCategory {
  emojis: Array<{ id: string; name: string; keywords?: string[]; skins: Array<{ src: string }> }>;
  id: string;
  name: string;
}
export interface EmojiPickerProps extends Omit<AvatarProps, 'avatar' | 'onChange'> {
  allowDelete?: boolean;
  allowModelAvatar?: boolean;
  allowUpload?: boolean | { enableEmoji?: boolean };
  compressSize?: number;
  contentProps?: { gap?: number; padding?: number; width?: number | string };
  customEmojis?: CustomEmojiCategory[];
  customRender?: (value: string) => ReactNode;
  customTabs?: Array<{
    label: ReactNode;
    value: string;
    render: (change: (value: string) => void) => ReactNode;
  }>;
  defaultAvatar?: string | null;
  defaultOpen?: boolean;
  locale?: string;
  onChange?: (value: string) => void;
  onDelete?: () => void;
  onOpenChange?: (open: boolean) => void;
  onUpload?: (file: File) => void;
  open?: boolean;
  popupClassName?: string;
  popupProps?: {
    side?: 'top' | 'bottom' | 'left' | 'right';
    align?: 'start' | 'center' | 'end';
    sideOffset?: number;
  };
  popupStyle?: CSSProperties;
  texts?: {
    emoji?: string;
    upload?: string;
    delete?: string;
    fileTypeError?: string;
    draggerDesc?: string;
    uploadBtn?: string;
  };
  value?: string;
}
