export interface DiagramLink {
  href: string;
  label: string;
  rel: string;
  target?: string;
}

/** Explicit navigation gestures are allowed; executable and local-device schemes are not. */
export function resolveDiagramHref(input: string, base: string): string | undefined {
  if (!input.trim() || input.trim().startsWith('#')) return undefined;
  try {
    const url = new URL(input, base);
    if (!['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol)) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

/** Read untrusted SVG as inert XML and expose only native, escaped text hyperlinks. */
export function getDiagramLinks(svg: string, base: string): DiagramLink[] {
  const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
  if (document.querySelector('parsererror')) return [];
  const links: DiagramLink[] = [];
  for (const element of document.querySelectorAll('a')) {
    const raw =
      element.getAttribute('href') ??
      element.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
    const href = raw && resolveDiagramHref(raw, base);
    if (!href) continue;
    const target = element.getAttribute('target') || undefined;
    const rel = [
      ...new Set([
        ...(element.getAttribute('rel') ?? '').split(/\s+/).filter(Boolean),
        'noopener',
        'noreferrer',
      ]),
    ].join(' ');
    const label = element.textContent?.trim() || element.getAttribute('aria-label') || href;
    links.push({ href, label, rel, target });
  }
  return links;
}
