import type { CSSProperties, ElementType, HTMLAttributes, Key, ReactNode, Ref } from 'react';

export interface ColorSwatchesItemType {
  color: string;
  key?: Key;
  title?: ReactNode;
}

/** Retains the published swatches container/layout/value contract without a vendor control. */
export interface ColorSwatchesProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  /** Native layout inputs consumed by the swatches container. */
  align?: 'center' | 'end' | 'flex-end' | 'flex-start' | 'start' | 'stretch' | 'baseline';
  allowShrink?: boolean;
  as?: ElementType;
  colors: ColorSwatchesItemType[];
  defaultValue?: string;
  direction?: 'vertical' | 'vertical-reverse' | 'horizontal' | 'horizontal-reverse';
  disabled?: boolean;
  distribution?: CSSProperties['justifyContent'];
  enableColorPicker?: boolean;
  enableColorSwatches?: boolean;
  flex?: number | string;
  gap?: number | string;
  height?: number | string;
  horizontal?: boolean;
  justify?: CSSProperties['justifyContent'];
  onChange?: (color?: string) => void;
  padding?: number | string;
  paddingBlock?: number | string;
  paddingInline?: number | string;
  prefixCls?: string;
  ref?: Ref<HTMLDivElement>;
  shape?: 'circle' | 'square';
  size?: number;
  texts?: { custom: string; presets: string };
  value?: string;
  visible?: boolean;
  width?: number | string;
  wrap?: CSSProperties['flexWrap'];
}
