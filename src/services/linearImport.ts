import { lambdaClient } from '@/libs/trpc/client';

class LinearImportService {
  installations = (...args: Parameters<typeof lambdaClient.linearSync.installations.query>) =>
    lambdaClient.linearSync.installations.query(...args);
  catalog = (...args: Parameters<typeof lambdaClient.linearSync.catalog.query>) =>
    lambdaClient.linearSync.catalog.query(...args);
  destinations = (...args: Parameters<typeof lambdaClient.linearImport.destinations.query>) =>
    lambdaClient.linearImport.destinations.query(...args);
  preview = (...args: Parameters<typeof lambdaClient.linearImport.preview.query>) =>
    lambdaClient.linearImport.preview.query(...args);
  status = (...args: Parameters<typeof lambdaClient.linearImport.status.query>) =>
    lambdaClient.linearImport.status.query(...args);
  startOAuth = (...args: Parameters<typeof lambdaClient.linearSync.startOAuth.mutate>) =>
    lambdaClient.linearSync.startOAuth.mutate(...args);
  start = (...args: Parameters<typeof lambdaClient.linearImport.start.mutate>) =>
    lambdaClient.linearImport.start.mutate(...args);
  resume = (...args: Parameters<typeof lambdaClient.linearImport.resume.mutate>) =>
    lambdaClient.linearImport.resume.mutate(...args);
}

export const linearImportService = new LinearImportService();
