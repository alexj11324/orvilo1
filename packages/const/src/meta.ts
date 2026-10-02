import { BRANDING_LOGO_URL } from '@orvilo/business-const';
import type { MetaData } from '@orvilo/types';

// No shipped default avatar image: an empty value makes the Avatar component
// fall back to name initials, so agents get distinct letter tiles.
export const DEFAULT_AVATAR = '';
export const DEFAULT_USER_AVATAR = '😀';
export const DEFAULT_SUPERVISOR_AVATAR = '🎙️';
export const DEFAULT_SUPERVISOR_ID = 'supervisor';
export const DEFAULT_BACKGROUND_COLOR = undefined;
export const DEFAULT_AGENT_META: MetaData = {};
export const DEFAULT_INBOX_TITLE = 'Orvilo AI';
export const DEFAULT_INBOX_AVATAR = BRANDING_LOGO_URL || '/app-icons/icon-512x512.png';
export const DEFAULT_USER_AVATAR_URL = BRANDING_LOGO_URL || '/app-icons/icon-192x192.png';
