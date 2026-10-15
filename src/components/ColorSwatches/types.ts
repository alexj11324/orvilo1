import type { FlexboxProps } from '@lobehub/ui';
import type { Key, ReactNode, Ref } from 'react';

export interface ColorSwatchesItemType {
  color: string;
  key?: Key;
  title?: ReactNode;
}

/** Retains the published swatches container/layout/value contract without a vendor control. */
export interface ColorSwatchesProps extends Omit<FlexboxProps, 'onChange' | 'ref'> {
  colors: ColorSwatchesItemType[];
  defaultValue?: string;
  disabled?: boolean;
  enableColorPicker?: boolean;
  enableColorSwatches?: boolean;
  onChange?: (color?: string) => void;
  ref?: Ref<HTMLDivElement>;
  shape?: 'circle' | 'square';
  size?: number;
  texts?: { custom: string; presets: string };
  value?: string;
}
