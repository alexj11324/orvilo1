import { getCliReleaseDownload } from '@/server/services/desktopRelease';

export const GET = async () => {
  try {
    const release = await getCliReleaseDownload();
    if (!release) return Response.json({ available: false }, { status: 404 });
    return Response.json(release);
  } catch {
    return Response.json(
      { available: false, error: 'CLI release information is unavailable' },
      { status: 502 },
    );
  }
};
