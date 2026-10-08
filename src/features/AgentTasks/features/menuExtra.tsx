import { CheckIcon } from 'lucide-react';

const renderCheck = () => <CheckIcon className="text-muted-foreground" size={14} />;

export const renderMenuCheck = (isCurrent: boolean) => (isCurrent ? renderCheck() : undefined);

export const renderMenuExtra = (shortcut: string, isCurrent: boolean) =>
  isCurrent ? (
    <div className="flex items-center gap-1.5">
      {renderCheck()}
      {shortcut}
    </div>
  ) : (
    shortcut
  );
