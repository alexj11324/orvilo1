import { type HTMLAttributes, type ReactNode } from 'react';

interface MobileContentLayoutProps extends HTMLAttributes<HTMLDivElement> {
  header?: ReactNode;
  withNav?: boolean;
}

const MobileContentLayout = ({
  children,
  withNav,
  style,
  header,
  id = 'orvilo-mobile-scroll-container',
  ...rest
}: MobileContentLayoutProps) => {
  const content = (
    <div
      className={'flex flex-col'}
      id={id}
      style={{
        height: '100%',
        overflowX: 'hidden',
        overflowY: 'auto',
        position: 'relative',
        width: '100%',
        ...style,
        // TabNav Height
        paddingBottom: withNav ? 48 : style?.paddingBottom,
      }}
      {...rest}
    >
      {children}
    </div>
  );

  if (!header) return content;

  return (
    <div
      className={'flex flex-col'}
      style={{ height: '100%', overflow: 'hidden', position: 'relative', width: '100%' }}
    >
      {header}
      <div
        className={'flex flex-col'}
        id={'orvilo-mobile-scroll-container'}
        style={{
          height: '100%',
          overflowX: 'hidden',
          overflowY: 'auto',
          position: 'relative',
          width: '100%',
          ...style,
          // TabNav Height
          paddingBottom: withNav ? 48 : style?.paddingBottom,
        }}
        {...rest}
      >
        {children}
      </div>
    </div>
  );
};

export default MobileContentLayout;
