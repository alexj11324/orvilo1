import { AccountsLoginForm as SharedLoginForm } from './LoginForm';
import { usePortalMessages } from './messagesContext';
import { resolveAccountsReturnUrl } from './redirect';
import { useProductOrigin } from './RuntimeClerkProvider';

export const buildGoogleLoginUrl = (
  returnUrl: string,
  origin: string,
  productOrigin?: string,
): string => {
  const destination = new URL(resolveAccountsReturnUrl(returnUrl, productOrigin), origin);
  const url = new URL('/oauth/google', origin);
  url.searchParams.set('return_url', destination.href);
  return url.href;
};

export const AccountsLoginForm = ({ returnUrl }: { returnUrl: string }) => {
  const messages = usePortalMessages();
  const productOrigin = useProductOrigin();
  return (
    <SharedLoginForm
      messages={messages}
      onGoogleLogin={() =>
        window.location.assign(
          buildGoogleLoginUrl(returnUrl, window.location.origin, productOrigin),
        )
      }
    />
  );
};
