import { describe, expect, it } from 'vitest';

import type { TopicListItem, TopicListPage } from '@/services/topic';

import {
  flattenTopicPages,
  MOBILE_TOPIC_STATUSES,
  type MobileTopicInput,
  toMobileTopicRows,
} from './mobileTopicRows';

const topic = (overrides: Partial<MobileTopicInput> = {}): MobileTopicInput => ({
  agentId: 'agent-1',
  id: 'topic-1',
  status: 'active',
  title: 'Weekly report draft',
  updatedAt: 1_700_000_000_000,
  ...overrides,
});

describe('toMobileTopicRows', () => {
  it('emits one row per topic, preserving feed order', () => {
    const rows = toMobileTopicRows([
      topic({ id: 'a', updatedAt: 3 }),
      topic({ id: 'b', updatedAt: 2 }),
      topic({ id: 'c', updatedAt: 1 }),
    ]);

    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('dedupes repeated topic ids — a feed can never paint stacked identical rows', () => {
    // Regression for the "three identical 自定义智能体 cards" bug: whatever the
    // upstream returns, the 会话 tab shows one row per conversation.
    const rows = toMobileTopicRows([
      topic({ id: 'a', title: 'Same conversation' }),
      topic({ id: 'a', title: 'Same conversation' }),
      topic({ id: 'a', title: 'Same conversation' }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('a');
  });

  it('drops topics with no agent parent — they have no /agent/:aid/:topicId destination', () => {
    const rows = toMobileTopicRows([
      topic({ agentId: null, id: 'orphan' }),
      topic({ agentId: undefined, id: 'undefined-agent' }),
      topic({ agentId: 'agent-2', id: 'ok' }),
    ]);

    expect(rows.map((r) => r.id)).toEqual(['ok']);
    expect(rows[0].agentId).toBe('agent-2');
  });

  it('carries no model or provider field — configuration never renders in navigation', () => {
    const rows = toMobileTopicRows([
      { ...topic(), model: 'deepseek-v4-flash', provider: 'deepseek' } as MobileTopicInput,
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty('model');
    expect(rows[0]).not.toHaveProperty('provider');
  });
});

describe('MOBILE_TOPIC_STATUSES', () => {
  it('excludes archived conversations only', () => {
    expect(MOBILE_TOPIC_STATUSES).not.toContain('archived');
    expect(MOBILE_TOPIC_STATUSES).toContain('running');
    expect(MOBILE_TOPIC_STATUSES).toContain('unread');
    expect(MOBILE_TOPIC_STATUSES).toContain('active');
    expect(MOBILE_TOPIC_STATUSES).toContain('completed');
  });
});

const feedItem = (id: string): TopicListItem => ({ id }) as TopicListItem;

const feedPage = (ids: string[], nextCursor: string | null): TopicListPage => ({
  items: ids.map(feedItem),
  nextCursor,
});

describe('flattenTopicPages', () => {
  it('concatenates pages in order', () => {
    const items = flattenTopicPages([
      feedPage(['a', 'b'], 'cursor-1'),
      feedPage(['c', 'd'], 'cursor-2'),
    ]);

    expect(items.map((item) => item.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('dedupes a topic repeated across a page boundary — bumped rows can appear twice', () => {
    // Cursor-overlap regression: a conversation bumped between the two fetches
    // is the tail of the fresh page AND the head of the older page. The feed
    // must still paint one row, and keep the newer page's copy.
    const staleCopy = { id: 'b', title: 'old snapshot' } as TopicListItem;
    const items = flattenTopicPages([
      {
        items: [feedItem('a'), { id: 'b', title: 'fresh snapshot' } as TopicListItem],
        nextCursor: 'c1',
      },
      { items: [staleCopy, feedItem('c')], nextCursor: null },
    ]);

    expect(items.map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(items[1].title).toBe('fresh snapshot');
  });

  it('an empty final page (cursor past the list end) contributes nothing', () => {
    const items = flattenTopicPages([feedPage(['a', 'b'], 'cursor-1'), feedPage([], null)]);

    expect(items.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('returns an empty list for no pages / undefined page slots', () => {
    expect(flattenTopicPages([])).toEqual([]);
    expect(flattenTopicPages([undefined, feedPage(['a'], null)])).toHaveLength(1);
  });
});
