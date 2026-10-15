import { User } from 'lucide-react';

import {
  Auth0,
  Authelia,
  Authentik,
  Casdoor,
  Cloudflare,
  Github,
  Logto,
  MicrosoftEntra,
  Zitadel,
} from '@/components/AuthBrandIcons';
import { Apple, Aws, Google, Microsoft } from '@/components/BrandIcons';

const iconComponents: { [key: string]: any } = {
  'apple': Apple,
  'auth0': Auth0,
  'authelia': Authelia,
  'authentik': Authentik,
  'casdoor': Casdoor,
  'cloudflare': Cloudflare.Color,
  'cognito': Aws.Color,
  'github': Github,
  'google': Google.Color,
  'logto': Logto,
  'microsoft': Microsoft.Color,
  'microsoft-entra-id': MicrosoftEntra,
  'zitadel': Zitadel,
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
