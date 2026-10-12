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
    <div className="relative flex w-full flex-wrap items-center justify-between gap-4 overflow-hidden rounded-(--radius-card) border border-border p-4 text-sm leading-5.5 text-foreground">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {avatar}
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="text-sm leading-5.5 font-semibold break-words">{title}</div>
          <div className="text-sm leading-5.5 break-words text-muted-foreground">{desc}</div>
        </div>
      </div>
      {action}
    </div>
  );
});

export default BaseErrorForm;
