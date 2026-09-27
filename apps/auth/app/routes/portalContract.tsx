import { AUTH_CONTRACT, authContractResponseHeaders } from '../portal/contract';

export const clientLoader = () =>
  new Response(JSON.stringify(AUTH_CONTRACT), {
    headers: { ...authContractResponseHeaders(), 'content-type': 'application/json' },
  });

export default function PortalContractRoute() {
  return null;
}
