import { type PropsWithChildren } from 'react';

import ProviderMenu from '../../ProviderMenu';
import Container from './Container';

const Layout = ({
  children,
  onProviderSelect,
}: PropsWithChildren & {
  onProviderSelect: (providerKey: string) => void;
}) => {
  return (
    <div className="flex max-h-full w-full">
      <ProviderMenu mobile={false} onProviderSelect={onProviderSelect} />
      <Container>{children}</Container>
    </div>
  );
};
export default Layout;
