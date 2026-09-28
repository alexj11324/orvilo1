import { resolveAuthLocale } from '../lib/locale';
import { buildAuthMeta } from '../lib/seo';

export const meta = () => buildAuthMeta(resolveAuthLocale(), '/reset-password');

// Account creation, verification and password reset all live on the accounts
// portal (Clerk) now — the shared sign-in bounce forwards there.
export { default } from '@/features/Auth/SignIn';
