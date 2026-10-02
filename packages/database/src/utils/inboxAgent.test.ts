import { DEFAULT_INBOX_AVATAR, DEFAULT_INBOX_TITLE, INBOX_SESSION_ID } from '@orvilo/const';
import { describe, expect, it } from 'vitest';

import {
  normalizeInboxAgentAvatar,
  normalizeInboxAgentMeta,
  normalizeInboxAgentTitle,
} from './inboxAgent';

const inbox = { slug: INBOX_SESSION_ID };
const builtin = { slug: 'agent-builder' };
const custom = { slug: 'my-agent' };

describe('normalizeInboxAgentTitle', () => {
  it('fills the inbox title when blank', () => {
    expect(normalizeInboxAgentTitle('', inbox)).toBe(DEFAULT_INBOX_TITLE);
    expect(normalizeInboxAgentTitle(null, inbox)).toBe(DEFAULT_INBOX_TITLE);
  });

  it('leaves other slugs and real titles untouched', () => {
    expect(normalizeInboxAgentTitle('My Agent', inbox)).toBe('My Agent');
    expect(normalizeInboxAgentTitle(null, custom)).toBeNull();
  });
});

describe('normalizeInboxAgentAvatar', () => {
  it('fills the inbox avatar when blank', () => {
    expect(normalizeInboxAgentAvatar('', inbox)).toBe(DEFAULT_INBOX_AVATAR);
    expect(normalizeInboxAgentAvatar('  ', inbox)).toBe(DEFAULT_INBOX_AVATAR);
    expect(normalizeInboxAgentAvatar(null, inbox)).toBe(DEFAULT_INBOX_AVATAR);
  });

  it('treats removed public/avatars paths as absent', () => {
    expect(normalizeInboxAgentAvatar('/avatars/agent-builder.png', builtin)).toBeNull();
    expect(normalizeInboxAgentAvatar('/avatars/doc-copilot.png', custom)).toBeNull();
  });

  it('treats npmmirror lobehub fluent-emoji URLs as absent', () => {
    const cdn = 'https://registry.npmmirror.com/@lobehub/fluent-emoji/files/png/1f477.png';
    expect(normalizeInboxAgentAvatar(cdn, builtin)).toBeNull();
    expect(
      normalizeInboxAgentAvatar('https://cdn.npmmirror.com/@lobehub/x.png', custom),
    ).toBeNull();
  });

  it('falls back to the inbox mark when the inbox avatar was removed', () => {
    expect(normalizeInboxAgentAvatar('/avatars/orvilo-ai.png', inbox)).toBe(DEFAULT_INBOX_AVATAR);
  });

  it('keeps real avatars untouched', () => {
    expect(normalizeInboxAgentAvatar('🛠️', builtin)).toBe('🛠️');
    expect(normalizeInboxAgentAvatar('/app-icons/icon-512x512.png', custom)).toBe(
      '/app-icons/icon-512x512.png',
    );
    expect(normalizeInboxAgentAvatar('https://cdn.example.com/a.png', custom)).toBe(
      'https://cdn.example.com/a.png',
    );
  });
});

describe('normalizeInboxAgentMeta', () => {
  it('normalizes avatar and title together', () => {
    const meta = normalizeInboxAgentMeta(
      { avatar: '/avatars/agent-builder.png', title: 'Builder' },
      builtin,
    );
    expect(meta.avatar).toBeNull();
    expect(meta.title).toBe('Builder');
  });
});
