'use client';

import { DirectionProvider } from '@base-ui/react/direction-provider';
import chroma from 'chroma-js';
import { cn } from 'cn';
import { PaletteIcon } from 'lucide-react';
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { CLICKABLE_FOCUS_RING } from '@/utils/clickableProps';

import {
  adjustSaturationBrightness,
  colorToHex,
  colorToHsv,
  type HsvColor,
  hsvToColor,
  parseHexColor,
  pointToSaturationBrightness,
  type RgbaColor,
} from './color';
import { SwatchButton, transparencyClassName } from './SwatchButton';
import type { ColorSwatchesItemType } from './types';

interface ColorPickerProps {
  direction: 'ltr' | 'rtl';
  disabled?: boolean;
  onChangeComplete: (color: string) => void;
  presets?: ColorSwatchesItemType[];
  presetsTitle?: ReactNode;
  selected?: boolean;
  shape: 'circle' | 'square';
  size: number;
  title: ReactNode;
  value?: string;
}

/** Resolve CSS color data through the browser and the already declared public color library. */
const readBrowserColor = (node: HTMLElement | null): RgbaColor | undefined => {
  if (!node || typeof window === 'undefined' || !node.style.color) return;
  const color = window.getComputedStyle(node).color;
  if (chroma.valid(color)) {
    const [r, g, b, a] = chroma(color).rgba();
    return { r, g, b, a };
  }
  // Canvas converts other browser-supported color spaces to the picker's sRGB byte model.
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.fillStyle = 'red';
  context.fillStyle = color;
  const first = context.fillStyle;
  context.fillStyle = 'lime';
  context.fillStyle = color;
  if (context.fillStyle !== first) return;
  context.clearRect(0, 0, 1, 1);
  context.fillRect(0, 0, 1, 1);
  const [r, g, b, alpha] = context.getImageData(0, 0, 1, 1).data;
  return { r: r!, g: g!, b: b!, a: alpha! / 255 };
};

export const ColorPicker = ({
  disabled,
  direction,
  onChangeComplete,
  presets,
  presetsTitle,
  selected,
  shape,
  size,
  title,
  value,
}: ColorPickerProps) => {
  const { t } = useTranslation('ui');
  const id = useId();
  const [open, setOpen] = useState(false);
  const initial = value ? parseHexColor(value) : undefined;
  const [color, setColor] = useState<HsvColor | undefined>(() => initial && colorToHsv(initial));
  const [hexDraft, setHexDraft] = useState(() => (initial ? colorToHex(initial).slice(1) : ''));
  const current = useRef(color);
  const probe = useRef<HTMLSpanElement>(null);
  const drag = useRef<
    { pointerId: number; initial: HsvColor; target: HTMLButtonElement } | undefined
  >(undefined);
  const keyboardDirty = useRef(false);
  const ownCommit = useRef<string | undefined>(undefined);
  const previousValue = useRef(value);

  const endDrag = useCallback((restoreInitial: boolean) => {
    const active = drag.current;
    if (!active) return;
    // Clear ownership before release: its lost-capture event must not undo a newer edit.
    drag.current = undefined;
    if (restoreInitial) {
      current.current = active.initial;
      setColor(active.initial);
      setHexDraft(colorToHex(hsvToColor(active.initial)).slice(1));
    }
    if (active.target.hasPointerCapture(active.pointerId)) {
      active.target.releasePointerCapture(active.pointerId);
    }
  }, []);

  const displayColor = (next: HsvColor, updateDraft = true) => {
    current.current = next;
    setColor(next);
    if (updateDraft) setHexDraft(colorToHex(hsvToColor(next)).slice(1));
  };
  const commit = (next: HsvColor) => {
    if (disabled) return;
    const hex = colorToHex(hsvToColor(next));
    ownCommit.current = hex;
    onChangeComplete(hex);
  };

  useEffect(() => {
    const externalChange = previousValue.current !== value;
    previousValue.current = value;
    if (ownCommit.current !== undefined && value === ownCommit.current) {
      ownCommit.current = undefined;
      return;
    }
    ownCommit.current = undefined;
    if (externalChange) {
      // A controlled update supersedes the old preview; never restore its initial color.
      endDrag(false);
      keyboardDirty.current = false;
    }
    if (current.current && (value === undefined || !externalChange)) return;
    const requested = value || 'var(--primary)';
    // An absent semantic variable is unavailable data, not permission to guess a palette.
    if (
      requested === 'var(--primary)' &&
      probe.current &&
      !window.getComputedStyle(probe.current).getPropertyValue('--primary').trim()
    )
      return;
    const resolved = parseHexColor(requested) ?? readBrowserColor(probe.current);
    if (!resolved) return;
    const next = colorToHsv(resolved, current.current?.h);
    current.current = next;
    setColor(next);
    setHexDraft(colorToHex(resolved).slice(1));
  }, [endDrag, open, value]);

  useEffect(() => {
    if (!disabled) return;
    endDrag(true);
    keyboardDirty.current = false;
    setOpen(false);
  }, [disabled, endDrag]);

  useEffect(() => () => endDrag(false), [endDrag]);

  const updatePointer = (event: PointerEvent<HTMLButtonElement>) => {
    if (disabled || !current.current) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = pointToSaturationBrightness({ x: event.clientX, y: event.clientY }, bounds);
    if (!position) return;
    const next = { ...current.current, ...position };
    displayColor(next);
    return next;
  };
  const cancelDrag = (event?: PointerEvent<HTMLButtonElement>) => {
    const active = drag.current;
    if (
      !active ||
      (event && (event.pointerId !== active.pointerId || event.currentTarget !== active.target))
    )
      return;
    endDrag(true);
  };
  const finishKeyboard = () => {
    if (!keyboardDirty.current || !current.current) return;
    keyboardDirty.current = false;
    commit(current.current);
  };
  const handleBoardKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled || !current.current) return;
    const next = adjustSaturationBrightness(current.current, event.key, event.shiftKey);
    if (!next) return;
    event.preventDefault();
    endDrag(false);
    keyboardDirty.current = true;
    displayColor(next);
  };

  const hueStyle = {
    '--color-picker-hue': color ? `hsl(${color.h} 100% 50%)` : undefined,
  } as CSSProperties;
  const large = size > 32;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) endDrag(true);
        setOpen(disabled ? false : next);
      }}
    >
      <span
        aria-hidden
        className="hidden"
        ref={probe}
        style={{ color: value || 'var(--primary)' }}
      />
      <SimpleTooltip title={title}>
        <span className="inline-flex pointer-coarse:p-1">
          <PopoverTrigger
            render={
              <Button
                aria-pressed={selected}
                disabled={disabled}
                size={large ? 'large' : 'normal'}
                style={size > 40 ? { minHeight: size, minWidth: size } : undefined}
                type="button"
                variant="ghost"
                className={cn(
                  "relative p-0 pointer-coarse:after:absolute pointer-coarse:after:-inset-1 pointer-coarse:after:content-['']",
                  large ? 'w-10' : 'w-9',
                  shape === 'circle' ? 'rounded-full' : 'rounded-(--radius-button)',
                  selected && 'ring-2 ring-ring ring-offset-2 ring-offset-background',
                )}
              >
                <span className="sr-only">{title}</span>
                <PaletteIcon aria-hidden className="size-4" />
              </Button>
            }
          />
        </span>
      </SimpleTooltip>
      <PopoverContent
        aria-label={typeof title === 'string' ? title : t('colorSwatches.custom')}
        className="max-h-(--available-height) gap-3 overflow-y-auto p-4"
        dir={direction}
      >
        <DirectionProvider direction="ltr">
          {color ? (
            <button
              aria-describedby={`${id}-board-help`}
              aria-label={t('colorSwatches.saturationBrightness')}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={Math.round(color.s)}
              disabled={disabled}
              role="slider"
              style={{ backgroundColor: `hsl(${color.h} 100% 50%)` }}
              type="button"
              aria-valuetext={t('colorSwatches.boardValue', {
                saturation: Math.round(color.s),
                brightness: Math.round(color.v),
              })}
              className={cn(
                CLICKABLE_FOCUS_RING,
                'relative aspect-square w-full touch-none overflow-hidden rounded-(--radius-input) border border-border bg-[linear-gradient(to_top,black,transparent),linear-gradient(to_right,white,transparent)] p-0',
              )}
              onBlur={finishKeyboard}
              onKeyDown={handleBoardKey}
              onKeyUp={finishKeyboard}
              onLostPointerCapture={cancelDrag}
              onPointerCancel={cancelDrag}
              onPointerDown={(event) => {
                if (
                  disabled ||
                  !current.current ||
                  drag.current ||
                  !event.isPrimary ||
                  event.button !== 0
                )
                  return;
                event.preventDefault();
                finishKeyboard();
                event.currentTarget.focus();
                drag.current = {
                  pointerId: event.pointerId,
                  initial: { ...current.current },
                  target: event.currentTarget,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
                updatePointer(event);
              }}
              onPointerMove={(event) => {
                if (drag.current?.pointerId === event.pointerId) updatePointer(event);
              }}
              onPointerUp={(event) => {
                if (drag.current?.pointerId !== event.pointerId) return;
                const next = updatePointer(event);
                endDrag(false);
                if (next) commit(next);
              }}
            >
              <span
                aria-hidden
                className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white ring-1 ring-black"
                style={{ left: `${color.s}%`, top: `${100 - color.v}%` }}
              />
            </button>
          ) : (
            <div
              className="flex aspect-square w-full items-center justify-center rounded-(--radius-input) bg-muted p-4 text-sm text-muted-foreground"
              role="status"
            >
              {t('colorSwatches.unavailable')}
            </div>
          )}
          <span className="sr-only" id={`${id}-board-help`}>
            {t('colorSwatches.boardKeys')}
          </span>
          <div className="flex flex-col gap-1" style={hueStyle}>
            <span className="text-sm" id={`${id}-hue-label`}>
              {t('colorSwatches.hue')}
            </span>
            <Slider
              aria-labelledby={`${id}-hue-label`}
              className="py-3 [&_[data-slot=slider-track]]:h-3 [&_[data-slot=slider-track]]:bg-[linear-gradient(to_right,red,yellow,lime,cyan,blue,magenta,red)] [&_[data-slot=slider-range]]:bg-transparent [&_[data-slot=slider-thumb]]:bg-(--color-picker-hue) [&_[data-slot=slider-thumb]]:after:-inset-4"
              disabled={disabled || !color}
              format={{ style: 'unit', unit: 'degree' }}
              max={360}
              min={0}
              value={color?.h ?? 0}
              onValueChange={(value) => {
                if (disabled || !current.current) return;
                const h = typeof value === 'number' ? value : value[0]!;
                endDrag(false);
                keyboardDirty.current = false;
                displayColor({ ...current.current, h });
              }}
              onValueCommitted={(value) => {
                if (disabled || !current.current) return;
                const h = typeof value === 'number' ? value : value[0]!;
                endDrag(false);
                keyboardDirty.current = false;
                commit({ ...current.current, h });
              }}
            />
          </div>
        </DirectionProvider>
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={cn(
              'relative size-8 flex-none overflow-hidden rounded-(--radius-input)',
              transparencyClassName,
            )}
          >
            <span
              className="absolute inset-0"
              style={{ backgroundColor: color ? colorToHex(hsvToColor(color)) : undefined }}
            />
          </span>
          <label className="text-sm" htmlFor={`${id}-hex`}>
            HEX
          </label>
          <Input
            aria-describedby={`${id}-hex-help`}
            aria-invalid={!!hexDraft && !parseHexColor(hexDraft)}
            autoComplete="off"
            disabled={disabled}
            id={`${id}-hex`}
            maxLength={9}
            spellCheck={false}
            value={hexDraft}
            visualSize="compact"
            onChange={(event) => {
              if (disabled) return;
              const draft = event.target.value.replace(/^#/, '');
              endDrag(true);
              keyboardDirty.current = false;
              setHexDraft(draft);
              const parsed = parseHexColor(draft);
              if (!parsed) return;
              const next = colorToHsv(parsed, current.current?.h);
              displayColor(next, false);
              commit(next);
            }}
          />
        </div>
        <p className="m-0 text-xs text-muted-foreground" id={`${id}-hex-help`}>
          {t('colorSwatches.hexHelp')}
        </p>
        {presets && (
          <div className="flex flex-col gap-2">
            <span className="text-sm">{presetsTitle ?? t('colorSwatches.presets')}</span>
            <div className="flex flex-wrap gap-1.5">
              {presets.map((preset, index) => (
                <SwatchButton
                  color={preset.color}
                  disabled={disabled}
                  key={preset.key ?? index}
                  selected={!!color && colorToHex(hsvToColor(color)) === preset.color}
                  shape={shape}
                  title={preset.title}
                  onClick={(event) => {
                    if (disabled) return;
                    const preview =
                      event.currentTarget.querySelector<HTMLElement>('[data-color-preview]');
                    const parsed = parseHexColor(preset.color) ?? readBrowserColor(preview);
                    if (!parsed) return;
                    endDrag(false);
                    keyboardDirty.current = false;
                    const next = colorToHsv(parsed, current.current?.h);
                    displayColor(next);
                    commit(next);
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};
