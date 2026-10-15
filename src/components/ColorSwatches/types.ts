import type { CSSProperties, ElementType, HTMLAttributes, Key, ReactNode, Ref } from 'react';

export interface ColorSwatchesItemType {
  color: string;
  key?: Key;
  title?: ReactNode;
}

type FlexPosition = 'center' | 'end' | 'flex-end' | 'flex-start' | 'start' | 'stretch' | 'baseline';

/** The flex container props the swatches root has always accepted. */
interface SwatchesLayoutProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  align?: FlexPosition;
  allowShrink?: boolean;
  as?: ElementType;
  direction?: 'vertical' | 'vertical-reverse' | 'horizontal' | 'horizontal-reverse';
  distribution?: CSSProperties['justifyContent'];
  flex?: number | string;
  gap?: number | string;
  height?: number | string;
  horizontal?: boolean;
  justify?: CSSProperties['justifyContent'];
  padding?: number | string;
  paddingBlock?: number | string;
  paddingInline?: number | string;
  prefixCls?: string;
  visible?: boolean;
  width?: number | string;
  wrap?: CSSProperties['flexWrap'];
}

/** Retains the published swatches container/layout/value contract without a vendor control. */
export interface ColorSwatchesProps extends SwatchesLayoutProps {
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
