'use client';
import { toast } from '@lobehub/ui/base-ui';
import { type Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { Check, Edit, X } from 'lucide-react';
import React, { memo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import ApiKeyDatePicker from '../ApiKeyDatePicker';

// Content type definition
export type ContentType = 'text' | 'date';

// Component Props interface definition
export interface EditableCellProps {
  /** Whether editing is disabled */
  disabled?: boolean;
  /** Submit callback function */
  onSubmit: (value: string | Date | null) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Content type */
  type: ContentType;
  /** Value retrieved from the database; regardless of type, it is stored as a string */
  value: string | null;
}

// Style definitions

// Main component implementation
const EditableCell = memo<EditableCellProps>(
  ({ value, type, onSubmit, placeholder, disabled = false }) => {
    const { t } = useTranslation('auth');

    // Edit state management
    const [isEditing, setIsEditing] = useState(false);

    // Ref for the Input element
    const inputRef = useRef<HTMLInputElement>(null);

    // Format display value
    const formatDisplayValue = (val: string | null) => {
      if (type === 'date' && val) {
        const date = dayjs(val);

        return date.isValid() ? date.format('YYYY-MM-DD') : val || placeholder || '';
      }

      return val || placeholder || '';
    };

    // Start editing
    const handleEdit = () => {
      if (disabled) return;

      setIsEditing(true);
    };

    // Submit edit
    const handleSubmit = () => {
      if (type === 'text') {
        const inputValue = inputRef.current?.value;

        if (!inputValue) {
          toast.warning(t('apikey.validation.required'));
          return;
        }

        onSubmit(inputValue);
      }

      setIsEditing(false);
    };

    // Cancel edit
    const handleCancel = () => {
      setIsEditing(false);
    };

    // Keyboard event handler for the input component
    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
        e.preventDefault();
        handleSubmit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      }
    };

    // Date picker submit handler
    const handleDatePickerSubmit = (date: Dayjs | null) => {
      onSubmit(date && dayjs(date).toISOString());

      setIsEditing(false);
    };

    // Render edit mode
    const renderEditMode = () => {
      switch (type) {
        case 'text': {
          return (
            <div className="flex-1">
              <Input
                autoFocus
                defaultValue={value as string}
                placeholder={placeholder}
                ref={inputRef}
                onKeyDown={handleKeyDown}
              />
            </div>
          );
        }

        case 'date': {
          const dateValue = value && dayjs(value).isValid() ? dayjs(value) : null;

          return (
            <ApiKeyDatePicker
              defaultValue={dateValue}
              open={true}
              onChange={handleDatePickerSubmit}
              onOpenChange={() => {
                if (isEditing) {
                  setIsEditing(false);
                }
              }}
            />
          );
        }

        default: {
          return null;
        }
      }
    };

    // Text type editing mode, showing save and cancel buttons
    if (type === 'text' && isEditing) {
      return (
        <div className="flex w-full items-center gap-2">
          {renderEditMode()}
          <div className="flex shrink-0 gap-1">
            <Button
              aria-label={t('apikey.detail.permissions.save')}
              size="icon-sm"
              type="button"
              variant="ghost"
              onClick={handleSubmit}
            >
              <Check />
            </Button>
            <Button
              aria-label={t('cancel', { ns: 'common' })}
              size="icon-sm"
              type="button"
              variant="ghost"
              onClick={handleCancel}
            >
              <X />
            </Button>
          </div>
        </div>
      );
    }

    // Date type editing mode, showing date picker
    if (type === 'date' && isEditing) {
      return renderEditMode();
    }

    // Display mode
    return (
      <div className="group relative flex min-h-8 items-center gap-2">
        <div className="min-w-0 break-all leading-normal">{formatDisplayValue(value)}</div>
        <Button
          aria-label={t('apikey.detail.permissions.edit')}
          className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
          size="icon-sm"
          type="button"
          variant="ghost"
          onClick={handleEdit}
        >
          <Edit />
        </Button>
      </div>
    );
  },
);

EditableCell.displayName = 'EditableCell';

export default EditableCell;
