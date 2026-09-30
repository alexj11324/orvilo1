import { Plus, X } from 'lucide-react';
import React, { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ArgsInputProps extends Omit<React.ComponentProps<'input'>, 'value' | 'onChange'> {
  onChange?: (value: string[]) => void;
  value?: string[];
}

const ArgsInput = memo<ArgsInputProps>(({ value = [], onChange, ...res }) => {
  const { t } = useTranslation('components');

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
    <div className="flex flex-col gap-2" style={{ width: '100%' }}>
      {value.length === 0 ? (
        <div className="flex items-center gap-2">
          <Input
            {...res}
            placeholder={t('ArgsInput.enterFirstArgument')}
            style={{ flex: 1 }}
            onBlur={(e) => {
              if (e.target.value.trim()) {
                onChange?.([e.target.value.trim()]);
              }
              res.onBlur?.(e);
            }}
          />
          <Button size={'sm'} variant="default" onClick={handleAddArg}>
            <Plus data-icon="inline-start" />
          </Button>
        </div>
      ) : (
        <>
          {value.map((arg, index) => (
            <div className="flex items-center gap-2" key={index}>
              <Input
                placeholder={t('ArgsInput.argumentPlaceholder', { index: index + 1 })}
                style={{ flex: 1 }}
                value={arg}
                onChange={(e) => handleArgChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, index)}
              />
              <ActionIcon
                icon={X}
                size="small"
                style={{ flexShrink: 0 }}
                onClick={() => handleRemoveArg(index)}
              />
            </div>
          ))}
          <Button
            className="border-dashed"
            size={'sm'}
            style={{ alignSelf: 'flex-start' }}
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
});

export default ArgsInput;
