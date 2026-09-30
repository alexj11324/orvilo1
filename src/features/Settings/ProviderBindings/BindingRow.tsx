import { Flexbox, FormItem } from '@lobehub/ui';
import { ActionIcon } from '@lobehub/ui/base-ui';
import type { ProviderBinding } from '@orvilo/types';
import { Pencil, PlugZap, Trash2 } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

interface BindingRowProps {
  binding: ProviderBinding;
  checking?: boolean;
  disabled?: boolean;
  onCheck: (binding: ProviderBinding) => void;
  onDelete: (binding: ProviderBinding) => void;
  onEdit: (binding: ProviderBinding) => void;
}

export const BindingRow = memo<BindingRowProps>(
  ({ binding, checking, disabled, onCheck, onDelete, onEdit }) => {
    const { t } = useTranslation('setting');
    return (
      <FormItem desc={binding.model} label={binding.name} layout={'horizontal'}>
        <Flexbox horizontal gap={4} justify={'flex-end'}>
          <ActionIcon
            disabled={disabled}
            icon={PlugZap}
            loading={checking}
            title={t('providerBindings.check')}
            onClick={() => onCheck(binding)}
          />
          <ActionIcon
            disabled={disabled}
            icon={Pencil}
            title={t('providerBindings.edit')}
            onClick={() => onEdit(binding)}
          />
          <ActionIcon
            danger
            disabled={disabled}
            icon={Trash2}
            title={t('providerBindings.delete')}
            onClick={() => onDelete(binding)}
          />
        </Flexbox>
      </FormItem>
    );
  },
);
