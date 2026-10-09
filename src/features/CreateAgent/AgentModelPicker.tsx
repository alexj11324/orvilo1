'use client';

import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from '@/components/ui/combobox';
import { Spinner } from '@/components/ui/spinner';

export interface AgentModelPickerProps {
  disabled?: boolean;
  error?: unknown;
  id?: string;
  loading?: boolean;
  onChange: (value: string) => void;
  onRetry?: () => void;
  options: Array<{ description?: string; label: string; value: string }>;
  size?: 'default' | 'lg';
  value: string;
}

export const AgentModelPicker = ({
  disabled,
  error,
  id,
  loading,
  onChange,
  onRetry,
  options,
  size,
  value,
}: AgentModelPickerProps) => {
  const { t } = useTranslation('chat');
  return (
    <Combobox
      disabled={disabled}
      isItemEqualToValue={(a, b) => a.value === b.value}
      itemToStringLabel={(option) => option.label}
      itemToStringValue={(option) => option.value}
      items={options}
      value={options.find((option) => option.value === value) ?? null}
      onValueChange={(option) => {
        if (option) onChange(option.value);
      }}
    >
      <ComboboxTrigger
        render={
          <Button
            className="w-full justify-between font-normal"
            id={id}
            size={size}
            variant="outline"
          />
        }
      >
        <span className="truncate">
          {options.find((option) => option.value === value)?.label ?? t('createAgent.model.choose')}
        </span>
        {loading && <Spinner className="size-3.5" />}
      </ComboboxTrigger>
      <ComboboxContent className="w-(--anchor-width) min-w-(--anchor-width)">
        <ComboboxInput
          aria-label={t('createAgent.model.search')}
          className="w-full"
          placeholder={t('createAgent.model.search')}
          showTrigger={false}
        />
        <ComboboxEmpty>{t('createAgent.model.empty')}</ComboboxEmpty>
        <ComboboxList className="max-h-60">
          {(option) => (
            <ComboboxItem key={option.value} value={option}>
              <span className="flex flex-col">
                <span>{option.label}</span>
                {option.description && (
                  <span className="text-xs text-muted-foreground">{option.description}</span>
                )}
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
        {error !== undefined && (
          <div className="p-2 text-sm text-destructive">
            {t('createAgent.model.error')}
            <Button size="sm" type="button" variant="ghost" onClick={onRetry}>
              {t('createAgent.retry')}
            </Button>
          </div>
        )}
      </ComboboxContent>
    </Combobox>
  );
};
