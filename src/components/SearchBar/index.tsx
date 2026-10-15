'use client';

import { cn } from 'cn';
import { Search, X } from 'lucide-react';
import {
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent,
  memo,
  useRef,
  useState,
} from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input, type InputVisualSize } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Spinner } from '@/components/ui/spinner';

interface SearchBarProps {
  autoFocus?: boolean;
  className?: string;
  /** Preserve legacy model chooser Escape behavior when explicitly false. */
  clearOnEscape?: boolean;
  defaultValue?: string;
  enableShortKey?: boolean;
  loading?: boolean;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  onPressEnter?: (e: KeyboardEvent<HTMLInputElement>) => void;
  onSearch?: (text: string) => void;
  placeholder?: string;
  shortKey?: string;
  style?: CSSProperties;
  value?: string;
  /** Omission preserves the public Input role/context; native size stays independent. */
  visualSize?: InputVisualSize;
}

const SearchBar = memo<SearchBarProps>(
  ({
    autoFocus,
    className,
    clearOnEscape = true,
    defaultValue,
    loading,
    enableShortKey,
    onBlur,
    onChange,
    onFocus,
    onKeyDown,
    onPressEnter,
    onSearch,
    placeholder,
    shortKey = 'mod+k',
    style,
    value,
    visualSize,
  }) => {
    const { t } = useTranslation('common');
    const [innerValue, setInnerValue] = useState(defaultValue ?? '');
    const [showTag, setShowTag] = useState(true);
    const inputRef = useRef<HTMLInputElement>(null);
    const inputValue = value ?? innerValue;
    const hotkey = shortKey.includes('+') ? shortKey : `mod+${shortKey}`;

    const clear = () => {
      setInnerValue('');
      if (!inputRef.current) return;
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        globalThis.HTMLInputElement.prototype,
        'value',
      )?.set;
      nativeInputValueSetter?.call(inputRef.current, '');
      inputRef.current.dispatchEvent(new Event('input', { bubbles: true }));
    };

    useHotkeys(
      hotkey,
      () => {
        inputRef.current?.focus();
      },
      {
        enableOnFormTags: true,
        enabled: !!enableShortKey && !!shortKey,
        preventDefault: true,
      },
    );

    return (
      <div
        className={cn('relative flex items-center pointer-coarse:py-1.5', className)}
        style={style}
      >
        <Search
          className="pointer-events-none absolute start-2 size-4 text-muted-foreground"
          size={16}
        />
        <Input
          aria-label={placeholder ?? 'Type keywords...'}
          autoFocus={autoFocus}
          className="bg-secondary pe-8 ps-8 pointer-coarse:pe-12"
          placeholder={placeholder ?? 'Type keywords...'}
          ref={inputRef}
          value={inputValue}
          visualSize={visualSize}
          onBlur={(e) => {
            onBlur?.(e);
            setInnerValue(e.target.value);
            setShowTag(true);
          }}
          onChange={(e) => {
            setInnerValue(e.target.value);
            onChange?.(e);
          }}
          onFocus={(e) => {
            onFocus?.(e);
            setShowTag(false);
          }}
          onKeyDown={(e) => {
            onKeyDown?.(e);
            // Same as the settings sidebar search: Esc clears a non-empty query and
            // stops there, so an enclosing dialog or panel does not also close.
            if (clearOnEscape && e.key === 'Escape' && inputValue) {
              e.stopPropagation();
              clear();
            }
            if (e.key === 'Enter') {
              onPressEnter?.(e);
              onSearch?.(inputValue);
            }
          }}
        />
        {loading ? (
          <Spinner className="absolute end-2 size-4 text-muted-foreground" />
        ) : inputValue ? (
          <Button
            aria-label={t('clearSearch', { defaultValue: 'Clear search' })}
            className="absolute end-0 pointer-coarse:end-2.5 rounded-(--radius-button) text-muted-foreground pointer-coarse:after:absolute pointer-coarse:after:-inset-1.75 pointer-coarse:after:content-['']"
            size="icon"
            type="button"
            variant="ghost"
            onClick={() => {
              clear();
              inputRef.current?.focus();
            }}
          >
            <X className="size-4" size={16} />
          </Button>
        ) : enableShortKey && showTag ? (
          <Kbd className="pointer-events-none absolute end-2 text-xs leading-5">
            {hotkey.replace('mod', '⌘')}
          </Kbd>
        ) : null}
      </div>
    );
  },
);

SearchBar.displayName = 'SearchBar';

export { SearchBar };
export default SearchBar;
