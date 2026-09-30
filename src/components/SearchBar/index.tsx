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

import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';

interface SearchBarProps {
  autoFocus?: boolean;
  className?: string;
  defaultValue?: string;
  enableShortKey?: boolean;
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
}

const SearchBar = memo<SearchBarProps>(
  ({
    autoFocus,
    className,
    defaultValue,
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
  }) => {
    const [innerValue, setInnerValue] = useState(defaultValue ?? '');
    const [showTag, setShowTag] = useState(true);
    const inputRef = useRef<HTMLInputElement>(null);
    const inputValue = value ?? innerValue;
    const hotkey = shortKey.includes('+') ? shortKey : `mod+${shortKey}`;

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
      <div className={cn('relative flex items-center', className)} style={style}>
        <Search className="pointer-events-none absolute left-2.5 text-muted-foreground" size={14} />
        <Input
          autoFocus={autoFocus}
          className="h-8 bg-secondary pr-7 pl-8"
          placeholder={placeholder ?? 'Type keywords...'}
          ref={inputRef}
          value={inputValue}
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
            if (e.key === 'Enter') {
              onPressEnter?.(e);
              onSearch?.(inputValue);
            }
          }}
        />
        {inputValue ? (
          <button
            aria-label="Clear search"
            className="absolute right-2 flex items-center text-muted-foreground hover:text-foreground"
            type="button"
            onClick={() => {
              const next = '';
              setInnerValue(next);
              if (inputRef.current) {
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                  globalThis.HTMLInputElement.prototype,
                  'value',
                )?.set;
                nativeInputValueSetter?.call(inputRef.current, next);
                inputRef.current.dispatchEvent(new Event('input', { bubbles: true }));
              }
            }}
          >
            <X size={12} />
          </button>
        ) : enableShortKey && showTag ? (
          <Kbd className="pointer-events-none absolute right-2">{hotkey.replace('mod', '⌘')}</Kbd>
        ) : null}
      </div>
    );
  },
);

SearchBar.displayName = 'SearchBar';

export { SearchBar };
export default SearchBar;
