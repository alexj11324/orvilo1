import urlJoin from 'url-join';

export const OFFICIAL_URL = 'https://orvilo.aspectlylabs.com';
export const OFFICIAL_SITE = 'https://orvilo.aspectlylabs.com';
// 用 apex 域而非具体主机名：Orvilo 的官方基础设施横跨
// orvilo / api / accounts 等多个子域，isOfficialCloudServer 需要把它们
// 都识别为官方云，而不是只有 web 应用那一个。
export const OFFICIAL_DOMAIN = 'aspectlylabs.com';

export const OFFICIAL_CLOUD_URL = OFFICIAL_SITE;

export const isOfficialCloudServer = (url?: string): boolean => {
  if (!url) return false;
  try {
    const { hostname } = new URL(url);
    return hostname === OFFICIAL_DOMAIN || hostname.endsWith(`.${OFFICIAL_DOMAIN}`);
  } catch {
    return false;
  }
};

export const OFFICIAL_DEVICE_GATEWAY_URL = 'https://device-gateway.aspectlylabs.com';
export const OFFICIAL_AGENT_GATEWAY_URL = 'https://agent-gateway.aspectlylabs.com';

export const OG_URL = '/og/og.webp?v=1';

export const OrviloPath = {
  webapi: {
    modelConfig: '/webapi/orvilo-model-config',
  },
} as const;

export const GITHUB = 'https://github.com/alexj11324/orvilo1';
export const GITHUB_ISSUES = urlJoin(GITHUB, 'issues/new/choose');

export const CHANGELOG = urlJoin(OFFICIAL_SITE, 'changelog');

export const DOCUMENTS = urlJoin(OFFICIAL_SITE, '/docs');
export const USAGE_DOCUMENTS = urlJoin(DOCUMENTS, '/usage');
export const SELF_HOSTING_DOCUMENTS = urlJoin(DOCUMENTS, '/self-hosting');
export const DATABASE_SELF_HOSTING_URL = urlJoin(SELF_HOSTING_DOCUMENTS, '/server-database');

// use this for the link
export const DOCUMENTS_REFER_URL = `${DOCUMENTS}?utm_source=chat_preview`;

export const WIKI_PLUGIN_GUIDE = urlJoin(USAGE_DOCUMENTS, '/plugins/development');
export const MANUAL_UPGRADE_URL = urlJoin(SELF_HOSTING_DOCUMENTS, '/advanced/upstream-sync');

export const BLOG = urlJoin(OFFICIAL_SITE, 'blog');

export const ABOUT = OFFICIAL_SITE;
export const FEEDBACK = urlJoin(GITHUB, 'issues/new/choose');
export const PRIVACY_URL = urlJoin(OFFICIAL_SITE, '/privacy');
export const TERMS_URL = urlJoin(OFFICIAL_SITE, '/terms');

export const PLUGINS_INDEX_URL = 'https://chat-plugins.aspectlylabs.com';

export const OPS_ASSETS_BASE_URL = 'https://chat-cloud.objects.aspectlylabs.com/dc/ops-assets';

export const MORE_MODEL_PROVIDER_REQUEST_URL = urlJoin(GITHUB, 'discussions');

export const MORE_FILE_PREVIEW_REQUEST_URL = urlJoin(GITHUB, 'discussions');

export const AGENTS_INDEX_GITHUB = 'https://github.com/alexj11324/orvilo1';
export const AGENTS_INDEX_GITHUB_ISSUE = urlJoin(AGENTS_INDEX_GITHUB, 'issues/new');
export const AGENTS_OFFICIAL_URL = urlJoin(OFFICIAL_SITE, 'agent');
export const WORKSPACE_OFFICIAL_URL = urlJoin(OFFICIAL_SITE, 'workspace');

export const AGENT_CHAT_URL = (agentId: string, mobile?: boolean) => {
  if (mobile) return `/agent/${agentId}`;
  return `/agent/${agentId}`;
};

export const AGENT_CHAT_TOPIC_URL = (agentId: string, topicId: string, mobile?: boolean) => {
  if (mobile) return urlJoin('/agent', agentId, topicId);
  return urlJoin('/agent', agentId, topicId);
};

export const AGENT_CHAT_TOPIC_PAGE_URL = (agentId: string, topicId: string, mobile?: boolean) => {
  if (mobile) return urlJoin('/agent', agentId, topicId, 'page');
  return urlJoin('/agent', agentId, topicId, 'page');
};

export const AGENT_PROFILE_URL = (agentId: string) => `/agent/${agentId}/profile`;

export const GROUP_CHAT_URL = (groupId: string) => `/group/${groupId}`;

export const GROUP_CHAT_TOPIC_URL = (groupId: string, topicId: string) =>
  urlJoin('/group', groupId, topicId);

export const LIBRARY_URL = (id: string) => urlJoin('/resource/library', id);

export const imageUrl = (filename: string) => `/app-images/${filename}`;

export const ORVILO_URL_IMPORT_NAME = 'settings';

export const RELEASES_URL = urlJoin(GITHUB, 'releases');

export const mailTo = (email: string) => `mailto:${email}`;

export const AES_GCM_URL = 'https://datatracker.ietf.org/doc/html/draft-ietf-avt-srtp-aes-gcm-01';
export const CHANGELOG_URL = urlJoin(OFFICIAL_SITE, 'changelog');

export const DOWNLOAD_URL = {
  android: 'https://play.google.com/store/apps/details?id=com.orvilo.app',
  default: urlJoin(OFFICIAL_SITE, '/downloads'),
  mobile: urlJoin(OFFICIAL_SITE, '/mobile'),
  ios: 'https://testflight.apple.com/join/2ZbjX4Qp',
} as const;

export const discoverUrl = (type: string, identifier: string) =>
  urlJoin(OFFICIAL_SITE, 'discover', type, identifier);
