'use client';

import { DirectionProvider } from '@base-ui/react/direction-provider';
import { cn } from 'cn';
import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useMergeState from 'use-merge-value';

import { useFormControlContext } from '@/components/FormControlContext';

import { ColorPicker } from './ColorPicker';
import { SwatchButton } from './SwatchButton';
import type { ColorSwatchesProps } from './types';

export type { ColorSwatchesItemType, ColorSwatchesProps } from './types';

const flexDirections: Record<
  NonNullable<ColorSwatchesProps['direction']>,
  CSSProperties['flexDirection']
> = {
  'horizontal': 'row',
  'horizontal-reverse': 'row-reverse',
  'vertical': 'column',
  'vertical-reverse': 'column-reverse',
};

export const ColorSwatches = ({
  align,
  allowShrink,
  as: Container = 'div',
  children: _children,
  className,
  colors,
  defaultValue,
  direction,
  disabled: disabledProp,
  distribution,
  enableColorPicker,
  enableColorSwatches = true,
  flex,
  gap = 6,
  height,
  horizontal = true,
  justify,
  onChange,
  padding,
  paddingBlock,
  paddingInline,
  prefixCls,
  ref,
  shape = 'circle',
  size = 24,
  style,
  texts,
  value,
  visible,
  width,
  wrap = 'wrap',
  ...native
}: ColorSwatchesProps) => {
  const { t, i18n } = useTranslation('ui');
  const formControl = useFormControlContext();
  const disabled = disabledProp ?? formControl.disabled;
  const [active, setActive] = useMergeState(defaultValue, { defaultValue, onChange, value });
  const root = useRef<HTMLDivElement | null>(null);
  const [textDirection, setTextDirection] = useState<'ltr' | 'rtl'>('ltr');
  // Stable composition retains caller ref callbacks/React19 cleanup during unrelated renders.
  const setRoot = useCallback(
    (node: HTMLDivElement | null) => {
      root.current = node;
      if (typeof ref === 'function') {
        const cleanup = ref(node);
        if (typeof cleanup === 'function')
          return () => {
            root.current = null;
            cleanup();
          };
      } else if (ref) ref.current = node;
    },
    [ref],
  );

  useEffect(() => {
    if (!root.current) return;
    const next = window.getComputedStyle(root.current).direction === 'rtl' ? 'rtl' : 'ltr';
    setTextDirection((current) => (current === next ? current : next));
  }, [className, i18n.language, native.dir, style?.direction]);

  const horizontalLayout = direction ? direction.startsWith('horizontal') : horizontal;
  const justifyContent = justify || distribution;
  const containerStyle: CSSProperties = {
    alignItems: align,
    flex,
    flexDirection: direction ? flexDirections[direction] : horizontal ? 'row' : 'column',
    flexWrap: wrap,
    gap,
    height,
    justifyContent,
    minWidth: allowShrink ? 0 : undefined,
    padding,
    paddingBlock,
    paddingInline,
    width: width ?? (horizontalLayout && justifyContent?.startsWith('space-') ? '100%' : undefined),
    ...style,
  };
  const interactionDisabled = disabled || visible === false;
  const chooseColor = (next?: string) => {
    if (!interactionDisabled) setActive(next);
  };
  const customActive = !!active && !colors.some((item) => item.color === active);

  return (
    <DirectionProvider direction={textDirection}>
      <Container
        {...native}
        ref={setRoot}
        style={containerStyle}
        className={cn(
          'flex',
          visible === false && 'hidden',
          prefixCls && `${prefixCls}-flex`,
          className,
        )}
      >
        {enableColorSwatches &&
          colors.map((item, index) => (
            <SwatchButton
              color={item.color || 'var(--primary)'}
              disabled={interactionDisabled}
              key={item.key ?? index}
              selected={(!active && !item.color) || item.color === active}
              shape={shape}
              size={size}
              title={item.title}
              onClick={() => chooseColor(item.color || undefined)}
            />
          ))}
        {enableColorPicker && (
          <ColorPicker
            direction={textDirection}
            disabled={interactionDisabled}
            presets={enableColorSwatches ? undefined : colors}
            presetsTitle={texts?.presets}
            selected={customActive}
            shape={shape}
            size={size}
            title={texts?.custom || t('colorSwatches.custom')}
            value={enableColorSwatches ? undefined : active}
            onChangeComplete={chooseColor}
          />
        )}
      </Container>
    </DirectionProvider>
  );
};

export default ColorSwatches;
