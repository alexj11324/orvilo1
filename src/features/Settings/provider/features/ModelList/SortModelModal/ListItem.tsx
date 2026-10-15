import { GripVertical } from 'lucide-react';
import { type AiProviderModelListItem } from 'model-bank';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { ModelIcon } from '@/components/OrviloIcons';
import { SortableItemHandle } from '@/components/reui/sortable';
import { Button } from '@/components/ui/button';

interface ListItemProps extends AiProviderModelListItem {
  disabled?: boolean;
}

const ListItem = memo<ListItemProps>(({ id, displayName, disabled }) => {
  const { t } = useTranslation('modelProvider');

  return (
    <>
      <div className="flex items-center gap-2">
        <ModelIcon model={id} size={24} type={'avatar'} />
        {displayName || id}
      </div>
      {!disabled && (
        <SortableItemHandle
          className="flex size-8 items-center justify-center rounded-(--radius-input) text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none pointer-coarse:size-11"
          render={
            <Button
              aria-label={`${t('sortModal.title')}: ${displayName || id}`}
              size="icon"
              type="button"
              variant="ghost"
            />
          }
        >
          <GripVertical aria-hidden className="size-4" />
        </SortableItemHandle>
      )}
    </>
  );
});

export default ListItem;
