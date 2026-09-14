import { BRANDING_EMAIL, SOCIAL_URL } from '@orvilo/business-const';

interface EmailSupportCopy {
  contactSupport?: string;
  /** Overridable so the escaping behaviour stays testable without depending on branding constants. */
  discordUrl?: string;
  joinDiscord?: string;
  /** Overridable for the same reason as `discordUrl`. */
  supportAddress?: string;
}

const DEFAULT_SUPPORT_COPY = {
  contactSupport: 'Contact support',
  joinDiscord: 'Join Discord',
} satisfies Required<Pick<EmailSupportCopy, 'contactSupport' | 'joinDiscord'>>;

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

export const EMAIL_SUPPORT_ADDRESS = BRANDING_EMAIL.support;
export const EMAIL_SUPPORT_REPLY_TO = BRANDING_EMAIL.replyTo;

const LINK_STYLE = 'color: #6b7280; text-decoration: underline;';
const SEPARATOR_HTML = '<span style="color: #a1a1aa;"> · </span>';

const supportLinkHtml = (address: string, label: string) =>
  `<a href="mailto:${escapeHtml(address)}" style="${LINK_STYLE}">${escapeHtml(label)}</a>`;

const discordLinkHtml = (url: string, label: string) =>
  `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" style="${LINK_STYLE}">${escapeHtml(label)}</a>`;

/**
 * A white-label deployment may not run a support inbox or a Discord server.
 * When a value is absent the segment is omitted rather than rendered as a dead
 * link — which also means this can legitimately return an empty string.
 */
export const getEmailSupportHtml = ({
  contactSupport = DEFAULT_SUPPORT_COPY.contactSupport,
  discordUrl = SOCIAL_URL.discord,
  joinDiscord = DEFAULT_SUPPORT_COPY.joinDiscord,
  supportAddress = EMAIL_SUPPORT_ADDRESS,
}: EmailSupportCopy = {}) =>
  [
    supportAddress ? supportLinkHtml(supportAddress, contactSupport) : undefined,
    discordUrl ? discordLinkHtml(discordUrl, joinDiscord) : undefined,
  ]
    .filter(Boolean)
    .join(SEPARATOR_HTML);

export const getEmailSupportText = ({
  contactSupport = DEFAULT_SUPPORT_COPY.contactSupport,
  discordUrl = SOCIAL_URL.discord,
  joinDiscord = DEFAULT_SUPPORT_COPY.joinDiscord,
  supportAddress = EMAIL_SUPPORT_ADDRESS,
}: EmailSupportCopy = {}) =>
  [
    supportAddress ? `${contactSupport}: ${supportAddress}` : undefined,
    discordUrl ? `${joinDiscord}: ${discordUrl}` : undefined,
  ]
    .filter(Boolean)
    .join(' | ');
