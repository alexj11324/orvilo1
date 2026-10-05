export interface CliReleaseInfo {
  assetName: string;
  publishedAt?: string;
  tag: string;
  url: string;
  version: string;
}

/** A missing asset is an unavailable install, rather than a registry fallback. */
export const cliReleaseService = {
  getLatest: async (): Promise<CliReleaseInfo | null> => {
    const response = await fetch('/webapi/cli-release');
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('CLI release information is unavailable');
    return response.json();
  },
};
