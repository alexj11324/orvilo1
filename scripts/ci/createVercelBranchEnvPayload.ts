import { stdout } from 'node:process';

export const createVercelBranchEnvPayload = (
  value: string,
  branch: string,
  method: 'PATCH' | 'POST',
) => ({
  ...(method === 'POST' ? { key: 'DATABASE_URL', type: 'sensitive' } : {}),
  gitBranch: branch,
  target: ['preview'],
  value,
});

const main = () => {
  const [branch, method] = process.argv.slice(2);
  const value = process.env.APP_DB_URL;
  if (!branch || (method !== 'PATCH' && method !== 'POST') || !value) {
    throw new Error('usage: createVercelBranchEnvPayload.ts <branch> <PATCH|POST>');
  }

  stdout.write(JSON.stringify(createVercelBranchEnvPayload(value, branch, method)));
};

if (import.meta.main) main();
