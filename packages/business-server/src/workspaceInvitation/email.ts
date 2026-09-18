import { INVITATION_EXPIRY_DAYS } from '@orvilo/const';

import { appEnv } from '@/envs/app';
import { getWorkspaceInviteEmailTemplate } from '@/libs/better-auth/email-templates/workspace-invite';
import { EmailService } from '@/server/services/email';

/**
 * Invitation links carry the raw token — the only place it may appear. The
 * `/invite/{token}` path is the landing route the SPA already reserves.
 */
export const buildInvitationUrl = (token: string) =>
  `${appEnv.APP_URL.replace(/\/$/, '')}/invite/${token}`;

/**
 * Best-effort invite delivery. The raw token crosses only into the outbound
 * email here; failures are reported to the caller so lastSentAt stays honest —
 * delivery state never decides invitation business state.
 */
export const sendInvitationEmail = async (params: {
  inviterEmail?: string | null;
  inviterName?: string | null;
  role: string;
  to: string;
  token: string;
  workspaceName: string;
}): Promise<boolean> => {
  try {
    const template = getWorkspaceInviteEmailTemplate({
      expiresInDays: INVITATION_EXPIRY_DAYS,
      inviterEmail: params.inviterEmail,
      inviterName: params.inviterName,
      role: params.role,
      url: buildInvitationUrl(params.token),
      workspaceName: params.workspaceName,
    });
    await new EmailService().sendMail({ to: params.to, ...template });
    return true;
  } catch (error) {
    console.error('[workspaceInvitation:sendInvitationEmail]', error);
    return false;
  }
};

/** `alex@example.com` → `a***@example.com` — enough for the invitee to recognise the mailbox. */
export const maskEmail = (email: string | null | undefined) => {
  if (!email) return '***';
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  return `${email[0]}***@${email.slice(at + 1)}`;
};
