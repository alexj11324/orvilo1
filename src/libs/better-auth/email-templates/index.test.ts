import { describe, expect, it, vi } from 'vitest';

import {
  getChangeEmailVerificationTemplate,
  getMagicLinkEmailTemplate,
  getResetPasswordEmailTemplate,
  getVerificationEmailTemplate,
  getVerificationOTPEmailTemplate,
  getWorkspaceInviteEmailTemplate,
  getWorkspaceMemberRemovedEmailTemplate,
} from './index';

// The support segment is branding-dependent: a white-label deployment may run
// neither a support inbox nor a Discord server, and the helpers then return an
// empty string on purpose rather than a dead link (see libs/email/support.ts).
// So the contract asserted here is the embedding itself — the HTML body carries
// whatever `getEmailSupportHtml()` returns, the plain-text body whatever
// `getEmailSupportText()` returns — which holds for every brand value.
const { SUPPORT_HTML_MARKER, SUPPORT_TEXT_MARKER } = vi.hoisted(() => ({
  SUPPORT_HTML_MARKER: '<!--email-support-html-marker-->',
  SUPPORT_TEXT_MARKER: 'email-support-text-marker',
}));

vi.mock('@/libs/email/support', () => ({
  getEmailSupportHtml: () => SUPPORT_HTML_MARKER,
  getEmailSupportText: () => SUPPORT_TEXT_MARKER,
}));

const templates = [
  getChangeEmailVerificationTemplate({
    expiresInSeconds: 3600,
    url: 'https://example.com/change-email',
  }),
  getMagicLinkEmailTemplate({
    expiresInSeconds: 600,
    url: 'https://example.com/sign-in',
  }),
  getResetPasswordEmailTemplate({ url: 'https://example.com/reset-password' }),
  getVerificationEmailTemplate({
    expiresInSeconds: 3600,
    url: 'https://example.com/verify-email',
  }),
  getVerificationOTPEmailTemplate({ expiresInSeconds: 600, otp: '123456' }),
  getWorkspaceInviteEmailTemplate({
    expiresInDays: 7,
    role: 'member',
    url: 'https://example.com/invite',
    workspaceName: 'Example Workspace',
  }),
  getWorkspaceMemberRemovedEmailTemplate({
    reason: 'removed_by_owner',
    workspaceName: 'Example Workspace',
  }),
];

describe('email templates', () => {
  it.each(templates)('embeds the support segment in both HTML and plain text', (template) => {
    expect(template.html).toContain(SUPPORT_HTML_MARKER);
    expect(template.text).toContain(SUPPORT_TEXT_MARKER);
    // Each body must use its own helper: HTML markup must not leak into the
    // plain-text body, and vice versa.
    expect(template.html).not.toContain(SUPPORT_TEXT_MARKER);
    expect(template.text).not.toContain(SUPPORT_HTML_MARKER);
  });
});
