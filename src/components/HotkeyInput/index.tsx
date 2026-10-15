'use client';

import { cn } from 'cn';
import { Undo2Icon, XIcon } from 'lucide-react';
import {
  type CSSProperties,
  memo,
  type MouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useHotkeys, useRecordHotkeys } from 'react-hotkeys-hook';
import { useTranslation } from 'react-i18next';
import useMergeState from 'use-merge-value';

import ActionIcon from '@/components/ActionIcon';
import { Kbd, KbdGroup } from '@/components/ui/kbd';

import { hotkeyLabels, isAppleDevice, isSameHotkey, normalizeRecordedKeys } from './keys';

export interface HotkeyInputProps {
  allowClear?: boolean;
  allowReset?: boolean;
  className?: string;
  defaultValue?: string;
  disabled?: boolean;
  /** Bindings already taken by other shortcuts; recording one of them is rejected. */
  hotkeyConflicts?: string[];
  onChange?: (value: string) => void;
  onClear?: (previous: string) => void;
  onConflict?: (keys: string) => void;
  placeholder?: string;
  /** The registered default, offered by the reset action. */
  resetValue?: string;
  style?: CSSProperties;
  texts?: { clear?: string; conflicts?: string; invalidCombination?: string; reset?: string };
  value?: string;
}

const HotkeyKeys = ({ apple, keys }: { apple: boolean; keys: string }) => (
  <KbdGroup>
    {hotkeyLabels(keys, apple).map((label, index) => (
      <Kbd className="rounded-(--radius-chip) border border-border text-xs leading-5" key={index}>
        {label}
      </Kbd>
    ))}
  </KbdGroup>
);

/** Records a keyboard shortcut on focus, rejecting combinations bound elsewhere. */
const HotkeyInput = memo<HotkeyInputProps>(
  ({
    allowClear,
    allowReset = true,
    className,
    defaultValue = '',
    disabled,
    hotkeyConflicts = [],
    onChange,
    onClear,
    onConflict,
    placeholder,
    resetValue = '',
    style,
    texts,
    value,
  }) => {
    const { t } = useTranslation('setting');
    const inputRef = useRef<HTMLInputElement>(null);
    const apple = useMemo(isAppleDevice, []);
    const [focused, setFocused] = useState(false);
    const [error, setError] = useState<'conflict' | 'invalid' | null>(null);
    const [hotkeyValue, setHotkeyValue] = useMergeState(defaultValue, {
      defaultValue,
      onChange,
      value,
    });
    const [recordedKeys, { start, stop, isRecording, resetKeys }] = useRecordHotkeys();

    // Releasing the combination ends recording by blurring the hidden input.
    useHotkeys('*', () => inputRef.current?.blur(), {
      enableOnContentEditable: true,
      enableOnFormTags: true,
      enabled: isRecording && !disabled,
      keydown: false,
      keyup: true,
      preventDefault: true,
    });

    const { isValid, keys } = normalizeRecordedKeys(recordedKeys, apple);
    const keysString = keys.join('+');

    useEffect(() => {
      if (recordedKeys.size === 0 || isRecording) return;

      if (!isValid) {
        setError('invalid');
        return;
      }

      const conflicted = hotkeyConflicts
        .filter((conflict) => conflict !== resetValue)
        .some((conflict) => isSameHotkey(conflict, keysString));

      if (conflicted) {
        setError('conflict');
        onConflict?.(keysString);
        return;
      }

      setError(null);
      setHotkeyValue(keysString);
      // Settle once per finished recording, not on every parent render.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [recordedKeys, isRecording]);

    const settle = () => {
      resetKeys();
      setError(null);
      setFocused(false);
      stop();
    };

    const handleClear = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const previous = hotkeyValue;
      setHotkeyValue('');
      settle();
      onClear?.(previous);
    };

    const handleReset = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setHotkeyValue(resetValue);
      settle();
    };

    const placeholderText = placeholder ?? t('hotkey.record');
    const showActions = !focused && !!hotkeyValue && !disabled && (allowReset || allowClear);

    return (
      <div className={cn('relative flex flex-col gap-2', className)} style={style}>
        <div
          className={cn(
            'relative flex h-9 max-w-full cursor-pointer items-center justify-between gap-2 rounded-(--radius-input) border border-input bg-transparent px-3 text-sm transition-colors',
            focused && 'bg-selected',
            error && 'border-destructive',
            disabled && 'cursor-not-allowed opacity-50',
          )}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (disabled || focused) return;
            inputRef.current?.focus();
          }}
        >
          <div className="pointer-events-none">
            {isRecording ? (
              keys.length > 0 ? (
                <HotkeyKeys apple={apple} keys={keysString} />
              ) : (
                <span className="text-foreground-description">{placeholderText}</span>
              )
            ) : hotkeyValue ? (
              <HotkeyKeys apple={apple} keys={hotkeyValue} />
            ) : (
              <span className="text-foreground-description">{placeholderText}</span>
            )}
          </div>
          <input
            readOnly
            aria-label={placeholderText}
            className="pointer-events-none absolute inset-0 -z-10 size-full opacity-0"
            disabled={disabled}
            ref={inputRef}
            onBlur={() => {
              setFocused(false);
              stop();
            }}
            onFocus={() => {
              if (disabled) return;
              setFocused(true);
              setError(null);
              start();
            }}
          />
          {showActions && (
            <div className="flex gap-1">
              {allowReset && hotkeyValue !== resetValue && (
                <ActionIcon
                  icon={Undo2Icon}
                  size={'small'}
                  title={texts?.reset ?? t('hotkey.reset')}
                  onClick={handleReset}
                />
              )}
              {allowClear && (
                <ActionIcon
                  icon={XIcon}
                  size={'small'}
                  title={texts?.clear ?? t('hotkey.clearBinding')}
                  onClick={handleClear}
                />
              )}
            </div>
          )}
        </div>
        {error && (
          <div className="text-xs text-destructive-text">
            {error === 'conflict'
              ? (texts?.conflicts ?? t('hotkey.conflicts'))
              : (texts?.invalidCombination ?? t('hotkey.invalidCombination'))}
          </div>
        )}
      </div>
    );
  },
);

HotkeyInput.displayName = 'HotkeyInput';

export default HotkeyInput;
