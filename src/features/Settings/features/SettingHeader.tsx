import { type FC, type ReactNode } from 'react';

import { Separator } from '@/components/ui/separator';

interface SettingHeaderProps {
  description?: ReactNode;
  extra?: ReactNode;
  title: ReactNode;
}

const SettingHeader: FC<SettingHeaderProps> = ({ title, description, extra }) => {
  return (
    <div className={'flex min-w-0'} style={{ flexDirection: 'column', gap: 24, paddingTop: 12 }}>
      <div
        className={'flex min-w-0'}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <div className={'flex min-w-0'} style={{ flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 24, fontWeight: 600 }}>{title}</span>
          {description && <span className={'text-muted-foreground'}>{description}</span>}
        </div>
        {extra}
      </div>
      <Separator />
    </div>
  );
};

export default SettingHeader;
