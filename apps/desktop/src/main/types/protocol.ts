/**
 * Protocol URL parsing result
 */
export interface ProtocolUrlParsed {
  /** Action type (e.g., 'install') */
  action: string;
  /** Original URL */
  originalUrl: string;
  /** All parsed query parameters */
  params: Record<string, string>;
  /** URL type (e.g., 'plugin') */
  urlType: string;
}
