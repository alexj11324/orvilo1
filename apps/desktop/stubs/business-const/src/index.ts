// Desktop builds resolve `@orvilo/business-const` to this stub instead of
// `packages/business/const`. It must mirror that module's public surface:
// anything omitted reads as `undefined` at runtime rather than failing loudly,
// which silently breaks comparisons such as `id === BRANDING_PROVIDER`.

export const BRANDING_LOGO_URL = '/app-icons/icon-512x512.png';
// 显式 string：下游 white-label 判定 `BRANDING_NAME !== 'LobeHub'` 需要它
// 不是字面量类型，否则 TS 会报 TS2367（无重叠比较）。与真源保持一致。
export const BRANDING_NAME: string = 'Orvilo';

export const ORG_NAME: string = 'Orvilo';

export const LOBE_CHAT_CLOUD = 'Orvilo Cloud';

export const BRANDING_PROVIDER = 'orvilo';

export const API_KEY_PREFIX = 'sk-ov-';

export const BRANDING_URL = {
  help: undefined,
  privacy: undefined,
  subscription: undefined,
  support: undefined,
  terms: undefined,
};

export const SOCIAL_URL = {
  discord: undefined,
  github: 'https://github.com/alexj11324/orvilo1',
  medium: undefined,
  x: undefined,
  youtube: undefined,
};

export const FILE_URL = {
  importFromNotionGuide: undefined,
};

export const BRANDING_EMAIL = {
  business: 'github@aspectlylabs.com',
  replyTo: undefined,
  support: undefined,
};

export const APPLE_APP_STORE_ID = '';

export const COPYRIGHT = `© ${new Date().getFullYear()} ${ORG_NAME}`;
export const COPYRIGHT_FULL = `${COPYRIGHT}. All rights reserved.`;

export const DEFAULT_EMBEDDING_PROVIDER = 'openai';
export const DEFAULT_MINI_MODEL = 'gpt-5.6-luna';
export const DEFAULT_MINI_PROVIDER = 'openai';
export const DEFAULT_MODEL = 'deepseek-v4-flash';
export const DEFAULT_ONBOARDING_MODEL = 'gemini-3-flash-preview';
export const DEFAULT_ONBOARDING_PROVIDER = 'google';
export const DEFAULT_PROVIDER = 'deepseek';
// MUST stay vision-capable: the acceptance review step judges evidence
// screenshots with this model, and a text-only judge silently passes every
// check whose evidence it cannot read.
export const DEFAULT_REVIEW_PREDICT_MODEL = 'gemini-3.6-flash';
export const DEFAULT_REVIEW_PREDICT_PROVIDER = 'google';
export const DEFAULT_VERIFY_MODEL = 'glm-5.3-flash';
export const DEFAULT_VERIFY_PROVIDER = 'zhipu';

export const UTM_SOURCE = 'chat_preview';

// mirrored from packages/business/const — model-bank gates the official
// provider entry on this flag; the OSS desktop build keeps it off
export const ENABLE_BUSINESS_FEATURES = false;

export const AGENT_ONBOARDING_ENABLED = false;

export const OFFICIAL_PROVIDER_DISABLE_ERROR = 'The official provider cannot be disabled.';

export const isOfficialProvider = (id: string) =>
  ENABLE_BUSINESS_FEATURES && id === BRANDING_PROVIDER;
