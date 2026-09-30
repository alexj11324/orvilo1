import { cssVar } from 'antd-style';
import { CheckIcon } from 'lucide-react';

const renderCheck = () => <CheckIcon size={14} style={{ color: cssVar.colorTextSecondary }} />;

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
