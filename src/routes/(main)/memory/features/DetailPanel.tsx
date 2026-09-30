import { type ComponentProps, memo } from 'react';

import { type NavHeaderProps } from '@/features/NavHeader';
import NavHeader from '@/features/NavHeader';
import RightPanel from '@/features/RightPanel';
import ToggleRightPanelButton from '@/features/RightPanel/ToggleRightPanelButton';

interface DetailPanelProps extends ComponentProps<'div'> {
  header?: NavHeaderProps;
}

const DetailPanel = memo<DetailPanelProps>(({ children, style, header, ...rest }) => {
  return (
    <RightPanel defaultWidth={480} maxWidth={640} minWidth={300}>
      <NavHeader
        {...header}
        left={
          <>
            <ToggleRightPanelButton />
            {header?.left}
          </>
        }
      />
      <div
        {...rest}
        className="flex flex-col flex-1 gap-4 px-4"
        style={{
          height: '100%',

          minWidth: 300,
          overflowY: 'auto',
          paddingBottom: 64,
          paddingTop: 16,
          ...style,
        }}
      >
        {children}
      </div>
    </RightPanel>
  );
});

export default DetailPanel;
