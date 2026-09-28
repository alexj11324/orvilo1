import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router';

/** Canonicalize /sign-in to /login, preserving auth and return parameters. */
export default function PortalSignInAlias() {
  const [params] = useSearchParams();
  const target = useMemo(() => {
    const serialized = params.toString();
    return serialized ? `/login?${serialized}` : '/login';
  }, [params]);

  useEffect(() => {
    window.location.replace(target);
  }, [target]);

  return null;
}
