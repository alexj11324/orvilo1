import { cn } from 'cn';
import { Plus, X } from 'lucide-react';
import React, { memo, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ArgsInputProps extends Omit<React.ComponentProps<'input'>, 'value' | 'onChange'> {
  onChange?: (value: string[]) => void;
  value?: string[];
}

const EMPTY_ARGS: string[] = [];

const ArgsInput = memo<ArgsInputProps>(
  ({ value = EMPTY_ARGS, onChange, ref, disabled, onBlur, onKeyDown, className, ...res }) => {
    const { t } = useTranslation('components');
    const [firstArg, setFirstArg] = useState('');
    // External import/reset can clear an unfinished first argument without changing
    // the original blur-only commit behavior. The empty default is stable.
    useEffect(() => {
      if (value.length === 0) setFirstArg('');
    }, [value]);

    const handleAddArg = useCallback(() => {
      onChange?.([...value, '']);
    }, [value, onChange]);

    const handleRemoveArg = useCallback(
      (index: number) => {
        const newValue = value.filter((_, i) => i !== index);
        onChange?.(newValue);
      },
      [value, onChange],
    );

    const handleArgChange = useCallback(
      (index: number, newArg: string) => {
        const newValue = [...value];
        newValue[index] = newArg;
        onChange?.(newValue);
      },
      [value, onChange],
    );

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (index === value.length - 1) {
            handleAddArg();
          }
        } else if (e.key === 'Backspace' && e.currentTarget.value === '' && value.length > 1) {
          e.preventDefault();
          handleRemoveArg(index);
        }
      },
      [value.length, handleAddArg, handleRemoveArg],
    );

    return (
      <div className="flex w-full flex-col gap-2">
        {value.length === 0 ? (
          <div className="flex items-center gap-2">
            <Input
              className={cn('flex-1', className)}
              {...res}
              disabled={disabled}
              placeholder={t('ArgsInput.enterFirstArgument')}
              ref={ref}
              value={firstArg}
              visualSize="normal"
              onChange={(event) => setFirstArg(event.target.value)}
              onKeyDown={onKeyDown}
              onBlur={(e) => {
                if (e.target.value.trim()) {
                  onChange?.([e.target.value.trim()]);
                }
                onBlur?.(e);
              }}
            />
            <div className="relative shrink-0 [@media(pointer:coarse)]:p-1.5">
              <Button
                aria-label={t('ArgsInput.addArgument')}
                className="relative [@media(pointer:coarse)]:after:absolute [@media(pointer:coarse)]:after:inset-[calc(var(--spacing)*-1.75)] [@media(pointer:coarse)]:after:content-['']"
                disabled={disabled}
                size="icon"
                type="button"
                variant="outline"
                onClick={handleAddArg}
              >
                <Plus />
              </Button>
            </div>
          </div>
        ) : (
          <>
            {value.map((arg, index) => (
              <div className="flex items-center gap-2" key={index}>
                <Input
                  {...res}
                  aria-describedby={res['aria-describedby']}
                  className={cn('flex-1', className)}
                  disabled={disabled}
                  id={index === 0 ? res.id : undefined}
                  placeholder={t('ArgsInput.argumentPlaceholder', { index: index + 1 })}
                  ref={index === 0 ? ref : undefined}
                  value={arg}
                  visualSize="normal"
                  onBlur={onBlur}
                  onChange={(e) => handleArgChange(index, e.target.value)}
                  onKeyDown={(e) => {
                    onKeyDown?.(e);
                    if (!e.defaultPrevented) handleKeyDown(e, index);
                  }}
                />
                <div className="relative shrink-0 [@media(pointer:coarse)]:p-1.5">
                  <ActionIcon
                    aria-label={t('remove', { ns: 'common' })}
                    className="relative [@media(pointer:coarse)]:after:absolute [@media(pointer:coarse)]:after:inset-[calc(var(--spacing)*-1.75)] [@media(pointer:coarse)]:after:content-['']"
                    disabled={disabled}
                    icon={X}
                    size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
                    onClick={() => handleRemoveArg(index)}
                  />
                </div>
              </div>
            ))}
            <Button
              className="self-start"
              disabled={disabled}
              size="normal"
              type="button"
              variant="outline"
              onClick={handleAddArg}
            >
              <Plus data-icon="inline-start" />
              {t('ArgsInput.addArgument')}
            </Button>
          </>
        )}
      </div>
    );
  },
);

export default ArgsInput;
