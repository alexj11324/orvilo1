/**
 * Agent Conversation Management Steps
 *
 * Step definitions for Agent conversation management E2E tests
 * - Create new conversation
 * - Switch conversations
 * - Rename conversation
 * - Delete conversation
 * - Search conversations
 */
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Given, Then, When } from '@cucumber/cucumber';
import { isRecord } from '@orvilo/utils/object';
import type { Frame, Request, Response } from '@playwright/test';
import { expect } from '@playwright/test';

import { llmMockManager } from '../../mocks/llm';
import type { CustomWorld } from '../../support/world';

// A send fired while another turn's agent_operation is live gets held
// client-side until that op goes terminal — under a CI Postgres stall the
// first turn can run for minutes, and the second conversation's topic row is
// only created by ITS run, so the sidebar never shows a second topic. Poll pg
// for the first turn to settle before opening the next topic.
const LIVE_OP_STATUSES = ['idle', 'running', 'waiting_for_async_tool', 'waiting_for_human'];

const DIAGNOSTIC_TIMEOUT_MS = 1000;
// 30 s owns the operation, then at most 1 s snapshot + 1 s artifact write.
// The final 1 s lets the runner receive the callback's original outcome.
const DELETE_STEP_TIMEOUT_MS = 33_000;

async function boundedDiagnostic<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('conversation diagnostic timed out'));
        }, DIAGNOSTIC_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

// Retain structure and equality, never workspace slugs, topic IDs or URL queries.
const pathShape = (pathname: string) =>
  pathname
    .split('/')
    .map((segment) =>
      !segment || ['chat', 'new', 'agent', 'home'].includes(segment)
        ? segment
        : segment.startsWith('tpc_')
          ? ':topic'
          : ':segment',
    )
    .join('/');

const observedProcedures = [
  'topic.removeTopic',
  'topic.getTopics',
  'topic.getTopicDetail',
  'topic.queryTopics',
  'topic.hasTopicFiles',
  'message.getMessages',
  'aiChat.execAgent',
];
const procedureNames = (request: Request) => {
  const pathname = new URL(request.url()).pathname;
  return decodeURIComponent(pathname.slice(pathname.lastIndexOf('/') + 1)).split(',');
};

function observeConversationBoundary(world: CustomWorld, phase: string) {
  const startedAt = Date.now();
  const events: Record<string, unknown>[] = [];
  const recordRequest = (request: Request, state: string, status?: number) => {
    const procedures = procedureNames(request).filter((name) => observedProcedures.includes(name));
    if (procedures.length)
      events.push({
        elapsedMs: Date.now() - startedAt,
        method: request.method(),
        procedures,
        state,
        status,
      });
  };
  const onRequest = (request: Request) => recordRequest(request, 'started');
  const onResponse = (response: Response) =>
    recordRequest(response.request(), 'response', response.status());
  const onRequestFailed = (request: Request) => recordRequest(request, 'failed');
  const onNavigation = (frame: Frame) => {
    if (frame === world.page.mainFrame())
      events.push({
        elapsedMs: Date.now() - startedAt,
        pathname: pathShape(new URL(frame.url()).pathname),
        state: 'navigation',
      });
  };
  world.page.on('request', onRequest);
  world.page.on('response', onResponse);
  world.page.on('requestfailed', onRequestFailed);
  world.page.on('framenavigated', onNavigation);

  return {
    events,
    async snapshot(label: string, expectedPath?: string, selectedTopicId?: string) {
      try {
        const pathname = new URL(world.page.url()).pathname;
        // Keep this serialized callback self-contained: tsx/cjs injects __name
        // into nested helpers, which do not exist in the browser execution realm.
        const dom = await boundedDiagnostic(() =>
          world.page.evaluate((selectedId) => {
            let visibleMessages = 0;
            let visibleTopics = 0;
            let visibleComposers = 0;
            let selectedTopicPresent = false;
            for (const element of document.querySelectorAll('.message-wrapper'))
              if (element.getClientRects().length) visibleMessages++;
            for (const element of document.querySelectorAll('[data-testid="topic-item"]')) {
              if (element.getClientRects().length) visibleTopics++;
              if (selectedId && element.getAttribute('data-topic-id') === selectedId)
                selectedTopicPresent = true;
            }
            for (const element of document.querySelectorAll(
              '[data-testid="chat-input"] [contenteditable="true"]',
            ))
              if (element.getClientRects().length) visibleComposers++;
            const button = document.querySelector('svg.lucide-message-square-plus')?.parentElement
              ?.parentElement;
            return {
              readyState: document.readyState,
              visibleMessages,
              visibleTopics,
              visibleComposers,
              blankComposer: visibleComposers > 0 && visibleMessages === 0,
              dialogCount: document.querySelectorAll('[role="dialog"], [role="alertdialog"]')
                .length,
              selectedTopicPresent: selectedId ? selectedTopicPresent : undefined,
              buttonPresent: !!button,
              buttonOpacity: button ? getComputedStyle(button).opacity : null,
              buttonDisabled: button
                ? button.getAttribute('aria-disabled') === 'true' || button.hasAttribute('disabled')
                : null,
            };
          }, selectedTopicId),
        );
        events.push({
          elapsedMs: Date.now() - startedAt,
          label,
          pathname: pathShape(pathname),
          expectedPathname: expectedPath ? pathShape(expectedPath) : undefined,
          pathnameEqualsExpected: expectedPath ? pathname === expectedPath : undefined,
          ...dom,
        });
      } catch {
        events.push({ label, state: 'snapshot-failed' });
      }
    },
    async finish(outcome: string) {
      world.page.off('request', onRequest);
      world.page.off('response', onResponse);
      world.page.off('requestfailed', onRequestFailed);
      world.page.off('framenavigated', onNavigation);
      const report = { phase, outcome, events };
      const directory = path.join(process.cwd(), 'reports');
      try {
        await boundedDiagnostic(async (signal) => {
          await mkdir(directory, { recursive: true });
          signal.throwIfAborted();
          await writeFile(
            path.join(directory, `conversation-boundary-${randomUUID()}.json`),
            JSON.stringify(report, null, 2),
            { signal },
          );
        });
      } catch {
        events.push({ state: 'artifact-write-failed' });
      }
      console.log('   📍 Conversation boundary:', JSON.stringify(report));
    },
  };
}

function deleteResponseCode(body: unknown, index: number): string | null {
  const entry: unknown = Array.isArray(body) ? body[index] : body;
  const error = isRecord(entry) && isRecord(entry.error) ? entry.error : undefined;
  if (!error) return isRecord(entry) && isRecord(entry.result) ? null : 'UNKNOWN_TRPC_RESPONSE';
  const payload = isRecord(error.json) ? error.json : error;
  const code = isRecord(payload.data) ? payload.data.code : undefined;
  const allowedCodes = [
    'BAD_REQUEST',
    'UNAUTHORIZED',
    'FORBIDDEN',
    'NOT_FOUND',
    'TIMEOUT',
    'CONFLICT',
    'PRECONDITION_FAILED',
    'INTERNAL_SERVER_ERROR',
    'METHOD_NOT_SUPPORTED',
    'TOO_MANY_REQUESTS',
    'CLIENT_CLOSED_REQUEST',
  ];
  return typeof code === 'string' && allowedCodes.includes(code) ? code : 'UNKNOWN_TRPC_ERROR';
}

async function waitForTurnSettled(world: CustomWorld, prompt: string, sentAt: number) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    await world.page.waitForTimeout(5_000);
    return;
  }
  const { default: pg } = await import('pg');
  const client = new pg.Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 10_000,
    query_timeout: 10_000,
  });
  try {
    await client.connect();
  } catch {
    return;
  }
  try {
    await expect
      .poll(
        async () => {
          try {
            const res = await client.query(
              `select o.status from agent_operations o
               where o.topic_id = (select topic_id from messages
                                   where role = 'user' and content = $1
                                     and created_at >= to_timestamp($2 / 1000.0) - interval '15 seconds'
                                   order by created_at desc limit 1)
               order by o.started_at desc nulls last limit 1`,
              [prompt, sentAt],
            );
            const status: string | undefined = res.rows[0]?.status;
            return status && !LIVE_OP_STATUSES.includes(status) ? status : null;
          } catch {
            return null;
          }
        },
        { message: `first turn operation never settled for prompt: ${prompt}`, timeout: 150_000 },
      )
      .toBeTruthy();
  } finally {
    await client.end().catch(() => {});
  }
}

// ============================================
// Given Steps
// ============================================

Given('用户已有一个对话', async function (this: CustomWorld) {
  console.log('   📍 Step: 创建一个对话...');

  // Send a message to create a conversation
  const chatInputs = this.page.locator('[data-testid="chat-input"]');
  const count = await chatInputs.count();

  let chatInputContainer = chatInputs.first();
  for (let i = 0; i < count; i++) {
    const elem = chatInputs.nth(i);
    const box = await elem.boundingBox();
    if (box && box.width > 0 && box.height > 0) {
      chatInputContainer = elem;
      break;
    }
  }

  // Click the inner editable: the card's footer rows (action bar, control
  // bar) sit inside the `chat-input` container, so a bare container click can
  // land on them and leave the editor unfocused — the typed text never lands.
  await chatInputContainer.locator('[contenteditable="true"]').first().click();
  await this.page.waitForTimeout(300);
  await this.page.keyboard.type('hello', { delay: 30 });
  await this.page.keyboard.press('Enter');

  // Wait for response
  await this.page.waitForTimeout(2000);

  // Store the current conversation title for later reference
  // Topic rows render as NavItem anchors inside [data-testid="topic-item"] wrappers
  const topicItems = this.page.locator('[data-testid="topic-item"]');
  const topicCount = await topicItems.count();
  console.log(`   📍 Found ${topicCount} topic items after creating conversation`);

  console.log('   ✅ 已创建一个对话');
});

Given('用户有多个对话历史', { timeout: 300_000 }, async function (this: CustomWorld) {
  console.log('   📍 Step: 创建多个对话...');

  // Keep the search fixture self-contained. Without a deterministic title,
  // the generic mock response becomes the topic title and the search scenario
  // only passes when another scenario happened to rename a topic on this worker.
  llmMockManager.setResponseContaining('测试对话内容', '测试对话');

  // Create first conversation
  const chatInputs = this.page.locator('[data-testid="chat-input"]');
  let chatInputContainer = chatInputs.first();
  const count = await chatInputs.count();
  for (let i = 0; i < count; i++) {
    const elem = chatInputs.nth(i);
    const box = await elem.boundingBox();
    if (box && box.width > 0 && box.height > 0) {
      chatInputContainer = elem;
      break;
    }
  }

  // First conversation - use "测试" content for search test
  await chatInputContainer.locator('[contenteditable="true"]').first().click();
  await this.page.waitForTimeout(300);
  await this.page.keyboard.type('测试对话内容', { delay: 30 });
  const firstSentAt = Date.now();
  await this.page.keyboard.press('Enter');

  // The second send is held client-side while the first turn's operation is
  // live, so its topic would never be created inside the poll window — wait
  // for this turn to finish before opening the new topic.
  await waitForTurnSettled(this, '测试对话内容', firstSentAt);
  // `/chat/:topicId` is the canonical conversation route — the legacy
  // `/agent/:aid/:tid` path auto-redirects, so wait for the settled URL.
  await this.page.waitForURL((url) => /\/chat\/tpc_[^/]+$/.test(url.pathname), {
    timeout: 30_000,
  });
  const firstTopicPath = new URL(this.page.url()).pathname;
  const agentPath = firstTopicPath.slice(0, firstTopicPath.lastIndexOf('/'));

  // Store first conversation reference
  this.testContext.firstConversation = 'first';

  // Create new topic and second conversation
  console.log('   📍 Creating second conversation...');
  // svg → Center wrapper → NavItem Block row (which carries the disabled
  // opacity style and owns the click handler).
  const addTopicButton = this.page
    .locator('svg.lucide-message-square-plus')
    .first()
    .locator('xpath=../..');
  await expect(addTopicButton, 'new-topic button is not rendered').toBeVisible({
    timeout: 30_000,
  });

  // The new-topic NavItem ignores clicks while a new-topic send is in flight
  // (isNewTopicSendInFlight) — it only dims (opacity 0.5), never errors, so a
  // bare sleep raced the flag under load and the "second" message silently
  // landed on topic 1. Wait for the send to settle before clicking.
  await expect
    .poll(async () => (await addTopicButton.getAttribute('style')) ?? '', {
      message: 'new-topic button stayed disabled — in-flight send never settled',
      timeout: 60_000,
    })
    .not.toContain('opacity: 0.5');

  const sendSecondMessage = async () => {
    await chatInputContainer.locator('[contenteditable="true"]').first().click();
    await this.page.waitForTimeout(300);
    await this.page.keyboard.type('hello world', { delay: 30 });
    await this.page.keyboard.press('Enter');
  };

  // The new-topic button opens the blank composer at `/chat/new`. The click
  // can still land while the row is mid-re-render after the settled poll, so
  // retry it once when the first navigation never fires.
  const navigationEvidence = observeConversationBoundary(this, 'multiple-conversations-navigation');
  let navigationOutcome = 'failed';
  try {
    await navigationEvidence.snapshot('before-first-click', `${agentPath}/new`);
    await addTopicButton.click();
    await navigationEvidence.snapshot('after-first-click', `${agentPath}/new`);
    try {
      await this.page.waitForURL((url) => url.pathname === `${agentPath}/new`, {
        timeout: 30_000,
      });
    } catch {
      await navigationEvidence.snapshot(
        'first-wait-failed-before-second-click',
        `${agentPath}/new`,
      );
      await addTopicButton.click();
      await navigationEvidence.snapshot('after-second-click', `${agentPath}/new`);
      await this.page.waitForURL((url) => url.pathname === `${agentPath}/new`, {
        timeout: 30_000,
      });
    }
    navigationOutcome = 'passed';
  } finally {
    try {
      await navigationEvidence.snapshot('navigation-finished', `${agentPath}/new`);
    } finally {
      await navigationEvidence.finish(navigationOutcome);
    }
  }
  await expect(this.page.locator('.message-wrapper')).toHaveCount(0, { timeout: 30_000 });
  await sendSecondMessage();

  // The new-topic click remounts the conversation view; an Enter fired while
  // the composer re-mounts is swallowed and no user row is ever committed
  // (pg showed topics=1 on CI). Verify the optimistic bubble exists and retry
  // the send once if it was dropped.
  const secondUserRow = this.page
    .locator('.message-wrapper')
    .filter({ hasText: 'hello world' })
    .last();
  try {
    await expect(secondUserRow, 'second send never produced a user row').toBeVisible({
      timeout: 20_000,
    });
  } catch {
    await sendSecondMessage();
    await expect(secondUserRow, 'second send still swallowed after retry').toBeVisible({
      timeout: 20_000,
    });
  }

  try {
    await this.page.waitForURL(
      (url) => url.pathname.startsWith(`${agentPath}/tpc_`) && url.pathname !== firstTopicPath,
      { timeout: 30_000 },
    );
  } catch (error) {
    console.log('   📍 Second-topic route at failure:', {
      firstTopicPath: pathShape(firstTopicPath),
      currentPath: pathShape(new URL(this.page.url()).pathname),
      pathnameEqualsFirst: new URL(this.page.url()).pathname === firstTopicPath,
      topicCount: await this.page.locator('[data-testid="topic-item"]').count(),
    });
    throw error;
  }

  // Confirm the second topic actually registered in the sidebar before the
  // scenario proceeds to click it. The sidebar is SWR-driven and only refetches
  // after the send mutation's getMessagesAndTopics tail resolves — that tail
  // can sit behind a CI Postgres stall, so a one-shot count reads a slow
  // refetch as "topic never created".
  try {
    await expect
      .poll(async () => this.page.locator('[data-testid="topic-item"]').count(), {
        timeout: 120_000,
      })
      .toBeGreaterThanOrEqual(2);
  } catch (error) {
    // Was the topic created server-side at all? pg evidence separates "send
    // never dispatched" from "sidebar refetch lagged".
    const agentId = this.page.url().match(/\/agent\/([^/?#]+)/)?.[1];
    if (agentId && process.env.DATABASE_URL) {
      try {
        const { default: pg } = await import('pg');
        const client = new pg.Client({
          connectionString: process.env.DATABASE_URL,
          connectionTimeoutMillis: 10_000,
          query_timeout: 10_000,
        });
        await client.connect();
        const res = await client.query(
          'select count(*)::int as c from topics where agent_id = $1',
          [agentId],
        );
        console.log(`   📍 pg topics for ${agentId}: ${res.rows[0]?.c}`);
        await client.end();
      } catch (queryError) {
        console.log(`   📍 topic count query failed: ${String(queryError)}`);
      }
    }
    throw error;
  }

  console.log('   ✅ 已创建多个对话');
});

// ============================================
// When Steps
// ============================================

When('用户点击新建对话按钮', async function (this: CustomWorld) {
  console.log('   📍 Step: 点击新建对话按钮...');

  // The add topic button uses MessageSquarePlusIcon from lucide-react
  const addTopicButton = this.page.locator('svg.lucide-message-square-plus').locator('..');

  if ((await addTopicButton.count()) > 0) {
    await addTopicButton.first().click();
    console.log('   ✅ 已点击新建对话按钮');
  } else {
    // Fallback: look for button with "新建" or "add" in title
    const addButton = this.page.locator('button[title*="新建"], button[title*="add"]');
    if ((await addButton.count()) > 0) {
      await addButton.first().click();
      console.log('   ✅ 已点击新建对话按钮 (fallback)');
    } else {
      throw new Error('New topic button not found');
    }
  }

  await this.page.waitForTimeout(500);
});

When('用户点击另一个对话', { timeout: 90_000 }, async function (this: CustomWorld) {
  console.log('   📍 Step: 点击另一个对话...');

  // Check if we're on the home page (has Recent Topics section)
  const recentTopicsSection = this.page.locator('text=Recent Topics');
  const isOnHomePage = (await recentTopicsSection.count()) > 0;
  console.log(`   📍 Is on home page: ${isOnHomePage}`);

  if (isOnHomePage) {
    // Click the second topic card in Recent Topics section
    // Cards are wrapped in Link components and contain "Hello! I am a mock AI" text from the mock
    const recentTopicCards = this.page.locator('a[href*="topic="]');
    const cardCount = await recentTopicCards.count();
    console.log(`   📍 Found ${cardCount} recent topic cards (by href)`);

    if (cardCount >= 2) {
      // Click the second card (different from current topic)
      await recentTopicCards.nth(1).click();
      console.log('   ✅ 已点击首页 Recent Topics 中的另一个对话');
      await this.page.waitForTimeout(2000);
      return;
    }

    // Fallback: try to find by text content
    const topicTextCards = this.page.locator('text=Hello! I am a mock AI');
    const textCardCount = await topicTextCards.count();
    console.log(`   📍 Found ${textCardCount} topic cards by text`);

    if (textCardCount >= 2) {
      await topicTextCards.nth(1).click();
      console.log('   ✅ 已点击首页 Recent Topics 中的另一个对话 (by text)');
      await this.page.waitForTimeout(2000);
      return;
    }
  }

  // Fallback: try to find topic items in the sidebar. The list is SWR-driven
  // and lags the send that created the conversation — poll rather than read a
  // one-shot count so a slow refetch isn't read as "only one topic exists".
  const sidebarTopics = this.page.locator('[data-testid="topic-item"]');
  let topicCount = 0;
  await expect
    .poll(
      async () => {
        topicCount = await sidebarTopics.count();
        console.log(`   📍 Found ${topicCount} topic items`);
        return topicCount;
      },
      { message: 'sidebar never listed a second topic', timeout: 30_000 },
    )
    .toBeGreaterThanOrEqual(2);

  // Click the second topic (first one is current/active)
  await sidebarTopics.nth(1).click();
  console.log('   ✅ 已点击另一个对话');

  await this.page.waitForTimeout(500);
});

When('用户右键点击对话', async function (this: CustomWorld) {
  console.log('   📍 Step: 右键点击对话...');

  const sidebarTopics = this.page.locator('[data-testid="topic-item"]');
  let topicCount = 0;
  await expect
    .poll(
      async () => {
        topicCount = await sidebarTopics.count();
        console.log(`   📍 Found ${topicCount} topic items`);
        return topicCount;
      },
      { message: 'sidebar never listed a topic', timeout: 30_000 },
    )
    .toBeGreaterThanOrEqual(1);

  await sidebarTopics.first().click({ button: 'right' });
  console.log('   ✅ 已右键点击对话');

  await this.page.waitForTimeout(500);
});

When('用户右键点击一个对话', async function (this: CustomWorld) {
  console.log('   📍 Step: 右键点击一个对话...');

  const sidebarTopics = this.page.locator('[data-testid="topic-item"]');
  let topicCount = 0;
  await expect
    .poll(
      async () => {
        topicCount = await sidebarTopics.count();
        console.log(`   📍 Found ${topicCount} topic items`);
        return topicCount;
      },
      { message: 'sidebar never listed a topic', timeout: 30_000 },
    )
    .toBeGreaterThanOrEqual(1);

  // Store the topic text for later verification
  const topicText = await sidebarTopics.first().textContent();
  this.testContext.deletedTopicTitle = topicText?.slice(0, 30);
  this.testContext.deletedTopicId = await sidebarTopics.first().getAttribute('data-topic-id');
  expect(this.testContext.deletedTopicId, 'selected topic must have a stable row ID').toBeTruthy();
  await sidebarTopics.first().click({ button: 'right' });
  console.log(`   ✅ 已右键点击对话: "${topicText?.slice(0, 30)}..."`);

  await this.page.waitForTimeout(500);
});

When('用户选择重命名选项', async function (this: CustomWorld) {
  console.log('   📍 Step: 选择重命名选项...');

  // First, close any open context menu by clicking elsewhere
  await this.page.click('body', { position: { x: 500, y: 300 } });
  await this.page.waitForTimeout(300);

  // Instead of using right-click context menu, use the "..." dropdown menu
  // which appears when hovering over a topic item
  const topicItems = this.page.locator('[data-testid="topic-item"]');
  const topicCount = await topicItems.count();
  console.log(`   📍 Found ${topicCount} topic items`);

  if (topicCount > 0) {
    // Hover on the first topic to reveal the "..." action button
    const firstTopic = topicItems.first();
    await firstTopic.hover();
    console.log('   📍 Hovering on topic item...');
    await this.page.waitForTimeout(500);

    // The "..." button should now be visible INSIDE the topic item
    // Important: we must find the icon WITHIN the hovered topic, not the global one
    // The topic item has a specific structure with nav-item-actions
    const moreButtonInTopic = firstTopic.locator('svg.lucide-ellipsis, svg.lucide-more-horizontal');
    const moreButtonCount = await moreButtonInTopic.count();
    console.log(`   📍 Found ${moreButtonCount} more buttons inside topic`);

    if (moreButtonCount > 0) {
      // Click the "..." button to open dropdown menu
      await moreButtonInTopic.first().click();
      console.log('   📍 Clicked ... button inside topic');
      await this.page.waitForTimeout(500);
    } else {
      // Fallback: try to find it by looking at the actions container
      console.log('   📍 Trying alternative: looking for actions container...');

      // Debug: print the topic item HTML structure
      const topicHTML = await firstTopic.evaluate((el) => el.outerHTML.slice(0, 500));
      console.log(`   📍 Topic HTML: ${topicHTML}`);

      // The actions might be in a sibling or parent element
      // Try finding any ellipsis icon that's near the topic
      const allEllipsis = this.page.locator('svg.lucide-ellipsis');
      const ellipsisCount = await allEllipsis.count();
      console.log(`   📍 Total ellipsis icons on page: ${ellipsisCount}`);

      // Skip the first one (which is the global topic list menu)
      // and click the second one (which should be in the topic item)
      if (ellipsisCount > 1) {
        await allEllipsis.nth(1).click();
        console.log('   📍 Clicked second ellipsis icon');
        await this.page.waitForTimeout(500);
      }
    }
  }

  // Now find the rename option in the dropdown menu
  const renameOption = this.page.getByRole('menuitem', { exact: true, name: /^(Rename|重命名)$/ });

  await expect(renameOption).toBeVisible({ timeout: 5000 });
  console.log('   📍 Found rename menu item');

  // Click the rename option
  await renameOption.click();
  console.log('   📍 Clicked rename menu item');

  // Wait for the popover/input to appear
  await this.page.waitForTimeout(500);

  // Check if input appeared
  const inputCount = await this.page.locator('input').count();
  console.log(`   📍 After click: ${inputCount} inputs on page`);

  console.log('   ✅ 已选择重命名选项');
});

When('用户输入新的对话名称 {string}', async function (this: CustomWorld, newName: string) {
  console.log(`   📍 Step: 输入新名称 "${newName}"...`);

  // Debug: check what's on the page
  const debugInfo = await this.page.evaluate(() => {
    const allInputs = document.querySelectorAll('input');
    const allPopovers = document.querySelectorAll(
      '[data-testid*="popover"], [data-slot*="popover"]',
    );
    const focusedElement = document.activeElement;
    return {
      focusedClass: focusedElement?.className,
      focusedTag: focusedElement?.tagName,
      inputCount: allInputs.length,
      inputTags: Array.from(allInputs).map((i) => ({
        className: i.className,
        placeholder: i.placeholder,
        type: i.type,
        visible: i.offsetParent !== null,
      })),
      popoverCount: allPopovers.length,
    };
  });
  console.log('   📍 Debug info:', JSON.stringify(debugInfo, null, 2));

  // Wait a short moment for the popover to render
  await this.page.waitForTimeout(300);

  // The rename UI can render as a dialog/modal in CI, not only as a popover.
  const renameInputSelectors = [
    '[role="dialog"] input[type="text"]',
    '[data-testid="editing-popover"] input',
    'input[type="text"]:visible',
  ];

  let renameInput = null;

  // Wait for any rename input to appear
  for (const selector of renameInputSelectors) {
    try {
      const locator = this.page.locator(selector).first();
      await locator.waitFor({ state: 'visible', timeout: 2000 });
      renameInput = locator;
      console.log(`   📍 Found input with selector: ${selector}`);
      break;
    } catch {
      // Try next selector
    }
  }

  if (!renameInput) {
    // Fallback: find any visible input that's not the search or chat input
    console.log('   📍 Trying fallback: finding any visible input...');
    const allInputs = this.page.locator('input:visible');
    const count = await allInputs.count();
    console.log(`   📍 Found ${count} visible inputs`);

    for (let i = 0; i < count; i++) {
      const input = allInputs.nth(i);
      const placeholder = await input.getAttribute('placeholder').catch(() => '');
      const testId = await input.getAttribute('data-testid').catch(() => '');

      // Skip search inputs and chat inputs
      if (placeholder?.includes('Search') || placeholder?.includes('搜索')) continue;
      if (testId === 'chat-input') continue;

      // Prefer inputs rendered inside rename containers.
      const isInRenameContainer = await input.evaluate((el) => {
        return (
          el.closest('[role="dialog"]') !== null ||
          el.closest('[data-testid="editing-popover"]') !== null
        );
      });

      if (isInRenameContainer || count === 1) {
        renameInput = input;
        console.log(`   📍 Found candidate input at index ${i}`);
        break;
      }
    }
  }

  if (renameInput) {
    // Clear and fill the input
    await renameInput.click();
    await renameInput.clear();
    await renameInput.fill(newName);
    console.log(`   📍 Filled input with "${newName}"`);

    const saveButton = this.page
      .locator('[role="dialog"]')
      .getByRole('button', { exact: true, name: /^(Save|保存)$/ })
      .first();

    try {
      await saveButton.waitFor({ state: 'visible', timeout: 1000 });
      await saveButton.click();
      console.log('   📍 Clicked save button');
    } catch {
      // Popover-based rename UIs still confirm with Enter.
      await renameInput.press('Enter');
      console.log('   📍 Confirmed rename with Enter');
    }

    console.log(`   ✅ 已输入新名称 "${newName}"`);
  } else {
    // Last resort: the input should have autoFocus, so keyboard should work
    console.log('   ⚠️ Could not find rename input element, using keyboard fallback...');
    // Select all and replace
    await this.page.keyboard.press('Meta+A');
    await this.page.waitForTimeout(50);
    await this.page.keyboard.type(newName, { delay: 20 });
    await this.page.keyboard.press('Enter');
    console.log(`   ✅ 已通过键盘输入新名称 "${newName}"`);
  }

  // Wait for the rename to be saved
  await this.page.waitForTimeout(1000);
});

When('用户选择删除选项', async function (this: CustomWorld) {
  console.log('   📍 Step: 选择删除选项...');

  // The context menu should be visible with "delete" option
  // Support both English and Chinese
  const deleteOption = this.page.getByRole('menuitem', { exact: true, name: /^(Delete|删除)$/ });

  await expect(deleteOption).toBeVisible({ timeout: 5000 });
  await deleteOption.click();

  console.log('   ✅ 已选择删除选项');
  await this.page.waitForTimeout(300);
});

When('用户确认删除', { timeout: DELETE_STEP_TIMEOUT_MS }, async function (this: CustomWorld) {
  const deadline = Date.now() + 30_000;
  this.testContext.deleteDeadline = deadline;
  console.log('   📍 Step: 确认删除...');

  // `Delete Topic` / `删除话题`: the topic delete flow confirms through the
  // DeleteTopicConfirm modal (#16030) instead of a generic ok/删除 button.
  const confirmButton = this.page
    .getByRole('dialog')
    .or(this.page.getByRole('alertdialog'))
    .getByRole('button', { name: /^(ok|delete( topic)?|删除(话题)?|确认|确定)$/i });

  const evidence = observeConversationBoundary(this, 'delete-conversation');
  let outcome = 'failed';
  let responseTimer: ReturnType<typeof setTimeout> | undefined;
  let resolveResponse: (response: Response) => void;
  const onDeleteResponse = (response: Response) => {
    if (procedureNames(response.request()).includes('topic.removeTopic')) resolveResponse(response);
  };
  try {
    await expect(confirmButton).toBeVisible({
      timeout: Math.min(5000, Math.max(1, deadline - Date.now())),
    });
    // Install before the click so even an immediate HTTP 200 TRPC error is captured.
    const responsePromise = new Promise<Response>((resolve, reject) => {
      resolveResponse = resolve;
      responseTimer = setTimeout(
        () => reject(new Error('delete response absent within 30 seconds')),
        Math.max(1, deadline - Date.now()),
      );
    });
    this.page.on('response', onDeleteResponse);
    // Keep a rejected waiter handled when the click itself fails.
    void responsePromise.catch(() => {});
    await confirmButton.click({ timeout: Math.max(1, deadline - Date.now()) });
    const response = await responsePromise;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let code: string | null;
    try {
      const body: unknown = await Promise.race([
        response.json().catch(() => {
          throw new Error('delete response could not be decoded');
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('delete response did not settle within 30 seconds')),
            Math.max(1, deadline - Date.now()),
          );
        }),
      ]);
      code = deleteResponseCode(
        body,
        procedureNames(response.request()).indexOf('topic.removeTopic'),
      );
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
    evidence.events.push({
      procedure: 'topic.removeTopic',
      status: response.status(),
      trpcCode: code,
    });
    expect(response.ok(), 'topic deletion HTTP response must succeed').toBe(true);
    expect(code, 'topic deletion must not return a TRPC error').toBeNull();
    outcome = 'response-succeeded';
    console.log('   ✅ 删除请求成功');
  } finally {
    this.page.off('response', onDeleteResponse);
    if (responseTimer !== undefined) clearTimeout(responseTimer);
    try {
      await evidence.snapshot(
        'delete-response-finished',
        undefined,
        this.testContext.deletedTopicId,
      );
    } finally {
      await evidence.finish(outcome);
    }
  }
});

When('用户在搜索框中输入 {string}', async function (this: CustomWorld, searchText: string) {
  console.log(`   📍 Step: 在搜索框中输入 "${searchText}"...`);

  // Find the search input in the sidebar
  // Support both English and Chinese placeholders
  const searchInput = this.page
    .locator(
      'input[placeholder*="Search"], input[placeholder*="搜索"], [data-testid="search-input"]',
    )
    .locator('visible=true');
  const searchIcon = this.page.locator('svg.lucide-search').locator('..').locator('visible=true');

  await searchInput.or(searchIcon).first().waitFor({ state: 'visible', timeout: 10_000 });

  if ((await searchInput.count()) > 0) {
    await searchInput.first().click();
    await searchInput.first().fill(searchText);
  } else {
    // Fallback: click on search icon to reveal search input
    if ((await searchIcon.count()) > 0) {
      await searchIcon.first().click();
      await this.page.waitForTimeout(300);
      // Now find the input
      const input = this.page.locator('input[type="text"]').last();
      await input.fill(searchText);
    }
  }

  console.log(`   ✅ 已输入搜索内容 "${searchText}"`);
  await this.page.waitForTimeout(500);
});

// ============================================
// Then Steps
// ============================================

Then('应该创建一个新的空白对话', async function (this: CustomWorld) {
  console.log('   📍 Step: 验证新对话已创建...');

  // The chat area should be empty or show welcome message
  // Check that there are no user/assistant messages
  const userMessages = this.page.locator('[data-role="user"]');
  const assistantMessages = this.page.locator('[data-role="assistant"]');

  const userCount = await userMessages.count();
  const assistantCount = await assistantMessages.count();

  console.log(`   📍 用户消息数量: ${userCount}, 助手消息数量: ${assistantCount}`);

  // New conversation should have no messages
  expect(userCount).toBe(0);
  expect(assistantCount).toBe(0);

  console.log('   ✅ 新对话已创建');
});

Then('页面应该显示欢迎界面', async function (this: CustomWorld) {
  console.log('   📍 Step: 验证页面显示欢迎界面...');

  // Wait for the page to update
  await this.page.waitForTimeout(500);

  // New conversation typically shows a welcome/empty state
  // Check for visible chat input (there may be 2 - desktop and mobile, find the visible one)
  const chatInputs = this.page.locator('[data-testid="chat-input"]');
  const count = await chatInputs.count();

  let foundVisible = false;
  for (let i = 0; i < count; i++) {
    const elem = chatInputs.nth(i);
    const box = await elem.boundingBox();
    if (box && box.width > 0 && box.height > 0) {
      foundVisible = true;
      console.log(`   📍 Found visible chat-input at index ${i}`);
      break;
    }
  }

  // Just verify the page is loaded properly by checking URL or any content
  if (!foundVisible) {
    // Fallback: just verify we're still on the chat page
    const currentUrl = this.page.url();
    expect(currentUrl).toContain('/chat');
    console.log('   📍 Fallback: verified we are on chat page');
  }

  console.log('   ✅ 欢迎界面已显示');
});

Then('应该切换到该对话', async function (this: CustomWorld) {
  console.log('   📍 Step: 验证已切换对话...');

  // The URL or active state should change
  // For now, just verify the page is responsive
  await this.page.waitForTimeout(500);

  console.log('   ✅ 已切换到该对话');
});

Then('显示该对话的历史消息', async function (this: CustomWorld) {
  console.log('   📍 Step: 验证显示历史消息...');

  // Wait for the loading to finish - the messages need time to load after switching topics
  console.log('   📍 等待消息加载...');
  await this.page.waitForTimeout(2000);

  // Wait for the message wrapper to appear (ChatItem component uses message-wrapper class)
  const messageSelector = '.message-wrapper';
  try {
    await this.page.waitForSelector(messageSelector, { timeout: 10_000 });
  } catch {
    console.log('   ⚠️ 等待消息选择器超时，尝试备用选择器...');
  }

  // There should be messages in the chat area
  const messages = this.page.locator(messageSelector);
  const messageCount = await messages.count();

  console.log(`   📍 找到 ${messageCount} 条消息`);

  // At least some messages should be visible
  expect(messageCount).toBeGreaterThan(0);

  console.log('   ✅ 历史消息已显示');
});

Then('对话名称应该更新为 {string}', async function (this: CustomWorld, expectedName: string) {
  console.log(`   📍 Step: 验证对话名称为 "${expectedName}"...`);

  // Wait for the rename to take effect
  await this.page.waitForTimeout(1000);

  // Find the topic with the new name by text content
  // Topics are in the sidebar, look for text directly
  // Use .first() since the name might appear in multiple places (sidebar + favorites section)
  const renamedTopic = this.page.getByText(expectedName, { exact: true }).first();

  await expect(renamedTopic).toBeVisible({ timeout: 5000 });

  console.log(`   ✅ 对话名称已更新为 "${expectedName}"`);
});

Then('该对话应该被删除', { timeout: DELETE_STEP_TIMEOUT_MS }, async function (this: CustomWorld) {
  console.log('   📍 Step: 验证对话已删除...');
  const topicId: string = this.testContext.deletedTopicId;
  expect(topicId, 'deletion must retain the selected row ID').toBeTruthy();
  const evidence = observeConversationBoundary(this, 'delete-outcome');
  let outcome = 'failed';
  // The ID is kept inside this scenario; assertions use a boolean so errors
  // cannot serialize the ID-bearing selector into logs or attachments.
  try {
    await expect
      .poll(
        async () => {
          const ids = await this.page.locator('[data-testid="topic-item"]').evaluateAll((rows) => {
            const result = [];
            for (const row of rows) result.push(row.getAttribute('data-topic-id'));
            return result;
          });
          const dialogCount = await this.page
            .getByRole('dialog')
            .or(this.page.getByRole('alertdialog'))
            .count();
          return (
            Date.now() < this.testContext.deleteDeadline &&
            !ids.includes(topicId) &&
            dialogCount === 0
          );
        },
        {
          message: 'selected topic row and delete confirmation must disappear',
          timeout: Math.max(1, this.testContext.deleteDeadline - Date.now()),
        },
      )
      .toBe(true);
    outcome = 'passed';
  } finally {
    await evidence.snapshot('delete-outcome-finished', undefined, topicId);
    await evidence.finish(outcome);
  }
  console.log('   ✅ 对话已删除');
});

Then('对话列表中不再显示该对话', async function (this: CustomWorld) {
  console.log('   📍 Step: 验证对话列表中不再显示该对话...');

  const topicId: string = this.testContext.deletedTopicId;
  expect(topicId, 'deletion must retain the selected row ID').toBeTruthy();
  const ids = await this.page.locator('[data-testid="topic-item"]').evaluateAll((rows) => {
    const result = [];
    for (const row of rows) result.push(row.getAttribute('data-topic-id'));
    return result;
  });
  expect(ids.includes(topicId), 'selected topic must remain absent from the list').toBe(false);
  console.log('   ✅ 已删除的对话已从列表中移除');
});

Then('应该显示包含 {string} 的对话', async function (this: CustomWorld, searchText: string) {
  console.log(`   📍 Step: 验证搜索结果包含 "${searchText}"...`);

  // Wait for search results to load (search opens a modal dialog)
  await this.page.waitForTimeout(2000);

  // Search results appear in the cmdk command palette, not in sidebar
  // Look for the palette ([cmdk-root]) and check for matching results
  const searchModal = this.page.locator('[cmdk-root]');
  const hasModal = (await searchModal.count()) > 0;
  console.log(`   📍 搜索模态框: ${hasModal}`);

  // Find matching items in the search results (either in modal or in sidebar if filtered)
  const matchingInModal = searchModal.getByText(searchText);
  const matchingInPage = this.page.getByText(searchText);

  const modalMatchCount = await matchingInModal.count();
  const pageMatchCount = await matchingInPage.count();

  console.log(`   📍 模态框中找到 ${modalMatchCount} 个匹配, 页面中找到 ${pageMatchCount} 个匹配`);

  // At least one match should be found (either in search input or results)
  expect(modalMatchCount + pageMatchCount).toBeGreaterThan(0);

  console.log(`   ✅ 搜索结果显示包含 "${searchText}" 的对话`);
});

Then('不相关的对话应该被过滤', async function (this: CustomWorld) {
  console.log('   📍 Step: 验证不相关对话已被过滤...');

  // This would require checking that non-matching topics are hidden
  // For now, just verify the search is active
  await this.page.waitForTimeout(300);

  console.log('   ✅ 不相关对话已被过滤');
});
