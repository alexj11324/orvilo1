/** The reasons the desktop OIDC callback puts in its failure redirect. */
const KNOWN_REASONS = ['invalid_request', 'internal_error'] as const;

export type OAuthFailureReason = (typeof KNOWN_REASONS)[number] | 'unknown';

/**
 * Map the `reason` query value to a reason this page has copy for. The URL is
 * attacker-controllable, so anything outside the known set — including a
 * missing value — becomes `unknown` and is never rendered itself.
 */
export const resolveOAuthFailureReason = (raw: string | null | undefined): OAuthFailureReason =>
  KNOWN_REASONS.find((reason) => reason === raw) ?? 'unknown';
