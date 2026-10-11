import { cn } from 'cn';
import fastDeepEqual from 'fast-deep-equal';
import { LucidePlus, LucideTrash } from 'lucide-react';
import { type CSSProperties } from 'react';
import { memo, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { v4 as uuidv4 } from 'uuid';

import ActionIcon from '@/components/ActionIcon';
import { FormInput } from '@/components/FormInput';
import { Button } from '@/components/ui/button';

import { type KeyValueItem } from './utils';
import { localListToRecord, recordToLocalList } from './utils';

const styles = {
  container: 'relative w-full rounded-(--radius-card) border border-divider p-4',
  input: 'font-mono text-sm leading-5.5',
  row: 'mbe-2 last:mbe-0',
  title: 'mbe-2 text-sm leading-5.5 text-foreground-tertiary',
};

export interface KeyValueEditorProps {
  addButtonText?: string;
  deleteTooltip?: string;
  disabled?: boolean;
  duplicateKeyErrorText?: string;
  keyPlaceholder?: string;
  onChange?: (value: Record<string, string>) => void;
  style?: CSSProperties;
  value?: Record<string, string>;
  valuePlaceholder?: string;
}

const KeyValueEditor = memo<KeyValueEditorProps>(
  ({
    value,
    onChange,
    keyPlaceholder,
    valuePlaceholder,
    addButtonText,
    duplicateKeyErrorText,
    deleteTooltip,
    disabled,
    style,
  }) => {
    const { t } = useTranslation('components');
    const [items, setItems] = useState<KeyValueItem[]>(() => recordToLocalList(value));
    const prevValueRef = useRef<Record<string, string> | undefined>(undefined);

    useEffect(() => {
      const externalRecord = value || {};
      if (!fastDeepEqual(externalRecord, prevValueRef.current)) {
        setItems(recordToLocalList(externalRecord));
        prevValueRef.current = externalRecord;
      }
    }, [value]);

    const triggerChange = (newItems: KeyValueItem[]) => {
      if (disabled) return;

      const keysCount: Record<string, number> = {};
      newItems.forEach((item) => {
        const trimmedKey = item.key.trim();
        if (trimmedKey) {
          keysCount[trimmedKey] = (keysCount[trimmedKey] || 0) + 1;
        }
      });
      setItems(
        newItems.map((item) => ({
          ...item,
        })),
      );
      onChange?.(localListToRecord(newItems));
    };

    const handleAdd = () => {
      if (disabled) return;

      const newItems = [...items, { id: uuidv4(), key: '', value: '' }];
      triggerChange(newItems);
    };

    const handleRemove = (id: string) => {
      if (disabled) return;

      const newItems = items.filter((item) => item.id !== id);
      triggerChange(newItems);
    };

    const handleKeyChange = (id: string, newKey: string) => {
      if (disabled) return;

      const newItems = items.map((item) => (item.id === id ? { ...item, key: newKey } : item));
      triggerChange(newItems);
    };

    const handleValueChange = (id: string, newValue: string) => {
      if (disabled) return;

      const newItems = items.map((item) => (item.id === id ? { ...item, value: newValue } : item));
      triggerChange(newItems);
    };

    const getDuplicateKeys = (currentItems: KeyValueItem[]): Set<string> => {
      const keys = new Set<string>();
      const duplicates = new Set<string>();
      currentItems.forEach((item) => {
        const trimmedKey = item.key.trim();
        if (trimmedKey) {
          if (keys.has(trimmedKey)) {
            duplicates.add(trimmedKey);
          } else {
            keys.add(trimmedKey);
          }
        }
      });
      return duplicates;
    };
    const duplicateKeys = getDuplicateKeys(items);

    return (
      <div className={styles.container} style={style}>
        <div className={cn('flex gap-2', styles.title)}>
          <div className={'flex flex-1 flex-col'}>
            {keyPlaceholder || t('KeyValueEditor.keyPlaceholder')}
          </div>
          <div className={'flex flex-2 flex-col'}>
            {valuePlaceholder || t('KeyValueEditor.valuePlaceholder')}
          </div>
          <div className="flex w-9 flex-col" />
        </div>
        <div className={'flex w-full flex-col'}>
          {items.map((item) => {
            const isDuplicate = item.key.trim() && duplicateKeys.has(item.key.trim());
            return (
              <div className={cn('flex w-full items-start gap-2', styles.row)} key={item.id}>
                <div className={'relative flex flex-1 flex-col'}>
                  <FormInput
                    className={styles.input}
                    disabled={disabled}
                    placeholder={keyPlaceholder || t('KeyValueEditor.keyPlaceholder')}
                    status={isDuplicate ? 'error' : undefined}
                    value={item.key}
                    variant={'filled'}
                    onChange={(e) => handleKeyChange(item.id, e)}
                  />
                  {isDuplicate && (
                    <div className="mt-1 text-xs leading-5 text-destructive-text">
                      {duplicateKeyErrorText || t('KeyValueEditor.duplicateKeyError')}
                    </div>
                  )}
                </div>
                <div className={'flex flex-2 flex-col'}>
                  <FormInput
                    className={styles.input}
                    disabled={disabled}
                    placeholder={valuePlaceholder || t('KeyValueEditor.valuePlaceholder')}
                    value={item.value}
                    variant={'filled'}
                    onChange={(value) => handleValueChange(item.id, value)}
                  />
                </div>
                <ActionIcon
                  disabled={disabled}
                  icon={LucideTrash}
                  size={{ blockSize: 36, borderRadius: 8, size: 14 }}
                  title={deleteTooltip || t('KeyValueEditor.deleteTooltip')}
                  onClick={() => handleRemove(item.id)}
                />
              </div>
            );
          })}
          <Button
            className={cn('w-full border-dashed', items.length > 0 ? 'mt-4' : 'mt-2')}
            disabled={disabled}
            size="lg"
            variant="outline"
            onClick={handleAdd}
          >
            <LucidePlus data-icon="inline-start" size={16} />
            {addButtonText || t('KeyValueEditor.addButton')}
          </Button>
        </div>
      </div>
    );
  },
);

export default KeyValueEditor;
