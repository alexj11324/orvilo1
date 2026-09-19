export const externalReviewIdentifier = (openUrl: string | null | undefined): string | null => {
  if (!openUrl) return null;
  try {
    const parsed = new URL(openUrl);
    const pull = parsed.pathname.match(/^\/([^/]+\/[^/]+)\/pull\/(\d+)/);
    if (pull) return `${pull[1]}#${pull[2]}`;
    const issue = parsed.pathname.match(/^\/([^/]+\/[^/]+)\/issues\/(\d+)/);
    if (issue) return `${issue[1]}#${issue[2]}`;
    if (parsed.hostname === 'linear.app' || parsed.hostname.endsWith('.linear.app')) {
      const slug = parsed.pathname.replace(/^\//, '').replace(/\/$/, '');
      return slug || null;
    }
    return null;
  } catch {
    return null;
  }
};
