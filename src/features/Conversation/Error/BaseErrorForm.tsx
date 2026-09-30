import { type ReactNode } from 'react';
import { memo } from 'react';

interface BaseErrorFormProps {
  action?: ReactNode;
  avatar?: ReactNode;
  desc?: ReactNode;
  title?: ReactNode;
}
const BaseErrorForm = memo<BaseErrorFormProps>(({ title, desc, action, avatar }) => {
  return (
    <div
      className="flex items-center gap-2 justify-between p-4"
      style={{
        border: `1px solid ${cssVar.colorBorder}`,
        borderRadius: cssVar.borderRadiusLG,

        overflow: 'hidden',
        position: 'relative',
        width: '100%',
      }}
    >
      <div className="flex items-center gap-3">
        {avatar}
        <div className="flex flex-col gap-0.5">
          <div className="font-medium">{title}</div>
          <div className="text-[12px] text-muted-foreground">{desc}</div>
        </div>
      </div>
      {action}
    </div>
  );
});

export default BaseErrorForm;
