export interface BrowserPageState {
  title?: string;
  url?: string;
}

export interface BrowserSnapshotState extends BrowserPageState {
  snapshot: string;
}

export interface BrowserReadPageState extends BrowserPageState {
  content: string;
}

export interface BrowserScreenshotState {
  /**
   * Inline capture, produced by the client executor. The server-proxied path
   * stores the image instead and sets {@link BrowserScreenshotState.url}, so a
   * consumer must accept either.
   */
  dataUrl?: string;
  height?: number;
  /** Stored artifacts, `{ fileId, mediaType, url }` — the shared tool-image contract. */
  images?: { fileId: string; mediaType: string; url: string }[];
  /** Accessible URL of the stored capture. */
  url?: string;
  width?: number;
}
