export const ORVILO_CLOUD = 'Orvilo Cloud';

// 显式标注为 string，而不是让 TS 推断出字面量类型。
// 下游的 white-label 判定写作 `BRANDING_NAME !== 'LobeHub'`（见
// packages/const/src/version.ts）：若这里被推断成字面量，由于品牌名
// 'Orvilo' 与 'LobeHub' 类型无重叠，该比较会被 TS 判为「无重叠的永真比较」而报 TS2367。
export const BRANDING_NAME: string = 'Orvilo';
// 用于自定义品牌下的 logo 渲染与 favicon 元数据。
// 取方形 app icon 是因为该值同时被 manifest 的图标与截图复用（见
// src/libs/metadata/manifest.ts 的 `BRANDING_LOGO_URL || url`）。
export const BRANDING_LOGO_URL = '/app-icons/icon-512x512.png';

export const ORG_NAME: string = 'Orvilo';

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

export const BRANDING_PROVIDER = 'orvilo';

export const APPLE_APP_STORE_ID = '';

export const COPYRIGHT = `© ${new Date().getFullYear()} ${ORG_NAME}`;
export const COPYRIGHT_FULL = `${COPYRIGHT}. All rights reserved.`;
