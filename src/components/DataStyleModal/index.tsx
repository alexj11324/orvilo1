import { type LucideIcon } from 'lucide-react';
import { createElement, type ReactNode } from 'react';
import { memo } from 'react';

import ImperativeModal from '@/components/ImperativeModal';

interface DataStyleModalProps {
  children: ReactNode;
  height?: number | string;
  icon: LucideIcon;
  onOpenChange?: (open: boolean) => void;
  open: boolean;
  title: string;
  width?: number;
}

const DataStyleModal = memo<DataStyleModalProps>(
  ({ icon, onOpenChange, title, open, children, width = 550, height }) => {
    return (
      <ImperativeModal
        centered
        afterOpenChange={onOpenChange}
        closable={false}
        footer={null}
        height={height}
        open={open}
        width={width}
        classNames={{
          title: 'text-2xl leading-8 font-semibold text-foreground',
        }}
        title={
          <div className={'flex gap-2'}>
            {createElement(icon, { size: 16 })}
            {title}
          </div>
        }
      >
        {children}
      </ImperativeModal>
    );
  },
);

export default DataStyleModal;
