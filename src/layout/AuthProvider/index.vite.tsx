import { isDesktop } from '@orvilo/const';
import { type PropsWithChildren } from 'react';

import Desktop from './Desktop';
import UserUpdater from './SessionAuth/UserUpdater';

const AuthProvider = ({ children }: PropsWithChildren) => {
  if (isDesktop) {
    return <Desktop>{children}</Desktop>;
  }

  // In SPA/Vite mode, the session lives in the `orvilo_auth` cookie minted by
  // the accounts portal exchange. When the cookie is absent the session fetch
  // resolves to no session and the user is treated as signed out.
  return <UserUpdater>{children}</UserUpdater>;
};

export default AuthProvider;
