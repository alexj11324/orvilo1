import { createMermaidPlugin, type MermaidConfig } from '@streamdown/mermaid';

const renderer = createMermaidPlugin();
let pending: Promise<unknown> = Promise.resolve();

/** All native diagram hosts share this queue: initialize and render form one operation. */
export function renderDiagram(
  id: string,
  source: string,
  config: MermaidConfig,
  signal?: AbortSignal,
): Promise<string> {
  const result = pending.then(async () => {
    if (signal?.aborted) throw new DOMException('Diagram render cancelled', 'AbortError');
    const engine = renderer.getMermaid({
      ...config,
      startOnLoad: false,
      securityLevel: 'strict',
      suppressErrorRendering: true,
      htmlLabels: false,
      flowchart: { ...config.flowchart, htmlLabels: false },
      secure: [
        'secure',
        'securityLevel',
        'startOnLoad',
        'maxTextSize',
        'maxEdges',
        'suppressErrorRendering',
      ],
    });
    const { svg } = await engine.render(id, source);
    return svg;
  });
  pending = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/** SVG is an isolated document, never dangerouslySetInnerHTML on the application DOM. */
export function diagramDocument(svg: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}body{display:flex;align-items:center;justify-content:center}svg{max-width:100%;max-height:100%;width:100%;height:100%}</style></head><body>${svg}</body></html>`;
}
