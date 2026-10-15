import { lambdaClient } from '@/libs/trpc/client';

class CredentialService {
  createKV = (...args: Parameters<typeof lambdaClient.creds.createKV.mutate>) =>
    lambdaClient.creds.createKV.mutate(...args);

}

export const credentialService = new CredentialService();
