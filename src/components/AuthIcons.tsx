import { Apple, Aws, Cloudflare, Github, Google, Microsoft } from '@lobehub/icons';
import { User } from 'lucide-react';

import {
  Auth0,
  AutheliaColor,
  AuthentikColor,
  CasdoorColor,
  LogtoColor,
  MicrosoftEntraColor,
  ZitadelColor,
} from '@/components/icons/brand';

const iconComponents: { [key: string]: any } = {
  'apple': Apple,
  'auth0': Auth0,
  'authelia': AutheliaColor,
  'authentik': AuthentikColor,
  'casdoor': CasdoorColor,
  'cloudflare': Cloudflare.Color,
  'cognito': Aws.Color,
  'github': Github,
  'google': Google.Color,
  'logto': LogtoColor,
  'microsoft': Microsoft.Color,
  'microsoft-entra-id': MicrosoftEntraColor,
  'zitadel': ZitadelColor,
};

/**
 * Get the auth icons component for the given provider id
 */
const AuthIcons = (id: string, size = 36) => {
  const IconComponent = iconComponents[id];
  if (IconComponent) {
    return <IconComponent size={size} />;
  }
  // Fallback to generic user icon for unknown providers
  return <User size={size} />;
};

export default AuthIcons;
