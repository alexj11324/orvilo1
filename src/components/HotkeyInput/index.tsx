'use client';

import { cn } from 'cn';
import { RotateCcw, X } from 'lucide-react';
import type { CSSProperties, FocusEventHandler } from 'react';
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePlatform } from '@/hooks/usePlatform';

import { canonicalShortcut, shortcutFromEvent, shortcutLabel } from './keys';

export interface HotkeyInputProps {
  allowClear?: boolean;
  allowReset?: boolean;
  className?: string;
  defaultValue?: string;
  disabled?: boolean;
  hotkeyConflicts?: string[];
  isApple?: boolean;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  onChange?: (value: string) => void;
  onClear?: (currentValue: string) => void;
  onConflict?: (conflictKey: string) => void;
  onFocus?: FocusEventHandler<HTMLInputElement>;
  onReset?: (currentValue: string, resetValue: string) => void;
  placeholder?: string;
  resetValue?: string;
  shadow?: boolean;
  style?: CSSProperties;
  texts?: { clear?: string; conflicts?: string; invalidCombination?: string; reset?: string };
  value?: string;
  variant?: 'filled' | 'borderless' | 'outlined';
}
export function HotkeyInput({
  allowClear,
  allowReset = true,
  className,
  defaultValue = '',
  disabled,
  hotkeyConflicts = [],
  isApple,
  onBlur,
  onChange,
  onClear,
  onConflict,
  onFocus,
  onReset,
  placeholder,
  resetValue = '',
  shadow,
  style,
  texts,
  value,
  variant = 'outlined',
}: HotkeyInputProps) {
  const { t } = useTranslation('setting');
  const platform = usePlatform();
  const apple = isApple ?? !!platform.isApple;
  const [internal, setInternal] = useState(defaultValue);
  const binding = value ?? internal;
  const [recording, setRecording] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<'conflict' | 'invalid'>();
  const pending = useRef<string | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const conflict = (candidate: string) =>
    hotkeyConflicts.some(
      (item) => canonicalShortcut(item, apple) === canonicalShortcut(candidate, apple),
    );
  const change = (candidate: string) => {
    setInternal(candidate);
    onChange?.(candidate);
  };
  const submit = (candidate: string) => {
    if (conflict(candidate)) {
      setError('conflict');
      onConflict?.(candidate);
      return false;
    }
    setError(undefined);
    change(candidate);
    return true;
  };
  const finish = () => {
    pending.current = undefined;
    setDraft('');
    setRecording(false);
    inputRef.current?.blur();
  };
  return (
    <div className={cn('flex flex-col gap-2', className)} style={style}>
      <div className="flex items-center gap-1">
        <Input
          readOnly
          aria-describedby={error ? errorId : undefined}
          aria-invalid={!!error}
          aria-label={placeholder ?? t('hotkey.record')}
          autoComplete="off"
          disabled={disabled}
          placeholder={placeholder ?? t('hotkey.record')}
          ref={inputRef}
          className={cn(
            'min-w-0 flex-1',
            variant === 'filled' && 'bg-fill-quaternary',
            variant === 'borderless' && 'border-transparent shadow-none',
            shadow && 'shadow-(--shadow-raised)',
          )}
          value={
            recording ? (draft ? shortcutLabel(draft, apple) : '') : shortcutLabel(binding, apple)
          }
          onBlur={(event) => {
            pending.current = undefined;
            setDraft('');
            setRecording(false);
            onBlur?.(event);
          }}
          onFocus={(event) => {
            if (disabled) return;
            pending.current = undefined;
            setDraft('');
            setError(undefined);
            setRecording(true);
            onFocus?.(event);
          }}
          onKeyDownCapture={(event) => {
            if (disabled || !recording || event.nativeEvent.isComposing) return;
            if (event.key === 'Tab') {
              pending.current = undefined;
              setDraft('');
              setRecording(false);
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            if (event.key === 'Escape') {
              setError(undefined);
              finish();
              return;
            }
            const candidate = shortcutFromEvent(event, apple);
            if (candidate) {
              pending.current = candidate;
              setDraft(candidate);
              setError(undefined);
            } else if (!['Control', 'Meta', 'Shift', 'Alt', 'OS', 'AltGraph'].includes(event.key)) {
              pending.current = undefined;
              setError('invalid');
            }
          }}
          onKeyUpCapture={(event) => {
            if (!recording || disabled) return;
            if (event.key === 'Tab') return;
            event.preventDefault();
            event.stopPropagation();
            if (pending.current) {
              const candidate = pending.current;
              pending.current = undefined;
              if (submit(candidate)) finish();
            }
          }}
        />
        {!recording && !disabled && allowReset && binding !== resetValue && (
          <Button
            aria-label={texts?.reset ?? t('hotkey.reset')}
            size="icon-sm"
            variant="ghost"
            onClick={() => {
              if (resetValue && conflict(resetValue)) {
                setError('conflict');
                onConflict?.(resetValue);
                return;
              }
              change(resetValue);
              setError(undefined);
              onReset?.(binding, resetValue);
            }}
          >
            <RotateCcw />
          </Button>
        )}
        {!recording && !disabled && allowClear && !!binding && (
          <Button
            aria-label={texts?.clear ?? t('hotkey.clearBinding')}
            size="icon-sm"
            variant="ghost"
            onClick={() => {
              change('');
              setError(undefined);
              onClear?.(binding);
            }}
          >
            <X />
          </Button>
        )}
      </div>
      {error && (
        <p className="text-xs text-destructive-text" id={errorId} role="alert">
          {error === 'conflict'
            ? (texts?.conflicts ?? t('hotkey.conflicts'))
            : (texts?.invalidCombination ?? t('hotkey.invalidCombination'))}
        </p>
      )}
    </div>
  );
}
