export type OrviloEnv = NonNullable<Window['orviloEnv']>;

export const getOrviloEnv = (): OrviloEnv | undefined => window.orviloEnv;

export const isDarwinDesktop = (): boolean => getOrviloEnv()?.platform === 'darwin';
