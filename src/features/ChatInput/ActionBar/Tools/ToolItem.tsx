import { Text } from '@lobehub/ui/base-ui';
import { memo, Suspense } from 'react';

import DebugNode from '@/components/DebugNode';

import type { CheckboxItemProps } from '../components/CheckboxWithLoading';
import CheckboxItem from '../components/CheckboxWithLoading';

const ToolItem = memo<CheckboxItemProps>(({ id, onUpdate, label, checked, disabled }) => {
  return (
    <Suspense fallback={<DebugNode trace="ActionBar/Tools/ToolItem" />}>
      <CheckboxItem
        checked={checked}
        disabled={disabled}
        hasPadding={false}
        id={id}
        label={
          <div className="flex flex-row items-center gap-2" style={{ minWidth: 0 }}>
            <Text
              style={{ lineHeight: 1.4, paddingBlock: 1 }}
              ellipsis={{
                tooltipWhenOverflow: true,
              }}
            >
              {label || id}
            </Text>
          </div>
        }
        onUpdate={onUpdate}
      />
    </Suspense>
  );
});

export default ToolItem;
