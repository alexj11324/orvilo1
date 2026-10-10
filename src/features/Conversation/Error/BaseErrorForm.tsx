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
    <div className="relative flex w-full items-center justify-between gap-2 overflow-hidden rounded-(--ant-border-radius-lg) border border-border p-4">
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
