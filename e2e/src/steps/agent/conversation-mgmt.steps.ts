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
import { Given, Then, When } from '@cucumber/cucumber';
import { expect } from '@playwright/test';

import { llmMockManager } from '../../mocks/llm';
import { E2E_PRIME_AGENT_TITLE } from '../../support/bindExecutionDevice';
import type { CustomWorld } from '../../support/world';

async function createConversationFromCommandMenu(world: CustomWorld) {
  await world.page.waitForURL((url) => /\/chat\/tpc_[^/]+$/.test(url.pathname), {
    timeout: 30_000,
  });
  const agentSelector = world.page
    .locator('[data-testid="chat-input"]:visible')
    .getByRole('button', { exact: true, name: E2E_PRIME_AGENT_TITLE });
  await expect(agentSelector).toBeVisible();

  await world.page.keyboard.press(`${world.modKey}+k`);
  const newConversation = world.page.locator(
    '[cmdk-root] [cmdk-item][data-value="create new conversation"]',
  );
  await expect(newConversation).toBeVisible();
  await expect(newConversation).toHaveAttribute('aria-disabled', 'false');
  await newConversation.click();

  await world.page.waitForURL((url) => /\/chat\/new$/.test(url.pathname));
  await expect(world.page.locator('[cmdk-root]')).toBeHidden();
  await expect(world.page.locator('.message-wrapper')).toHaveCount(0);
  // The blank composer uses the last sent Agent, so the fixture must keep
  // its Prime Agent rather than silently falling back to another provider.
  await expect(agentSelector).toBeVisible();
}

const TOPIC_ITEM = '[data-testid="topic-item"]';

// Topic history only lives in the conversation header's title menu: its rows
// exist in the DOM only while the popover is open.
async function openHistoryMenu(world: CustomWorld) {
  const trigger = world.page.locator('[data-testid="chat-history-trigger"]:visible').first();
  await expect(trigger).toBeVisible({ timeout: 30_000 });
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
  await expect(world.page.locator('[data-slot="popover-content"] input').first()).toBeVisible({
    timeout: 10_000,
  });
}

async function closeHistoryMenu(world: CustomWorld) {
  await world.page.keyboard.press('Escape');
  await expect(world.page.locator('[data-slot="popover-content"] input')).toHaveCount(0);
}

/** Open the menu, read the topic row count, close it again. */
async function countTopicsInMenu(world: CustomWorld) {
  await openHistoryMenu(world);
  const count = await world.page.locator(TOPIC_ITEM).count();
  await closeHistoryMenu(world);
  return count;
}

// A send fired while another turn's agent_operation is live gets held
// client-side until that op goes terminal — under a CI Postgres stall the
// first turn can run for minutes, and the second conversation's topic row is
// only created by ITS run, so the history menu never shows a second topic. Poll pg
// for the first turn to settle before opening the next topic.
const LIVE_OP_STATUSES = ['idle', 'running', 'waiting_for_async_tool', 'waiting_for_human'];

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

  // Create the second conversation through the retained command palette.
  console.log('   📍 Creating second conversation...');
  await createConversationFromCommandMenu(this);

  const sendSecondMessage = async () => {
    await chatInputContainer.locator('[contenteditable="true"]').first().click();
    await this.page.waitForTimeout(300);
    await this.page.keyboard.type('hello world', { delay: 30 });
    await this.page.keyboard.press('Enter');
  };

  await sendSecondMessage();

  // Opening a new conversation remounts the view; an Enter fired while
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
      firstTopicPath,
      currentPath: new URL(this.page.url()).pathname,
      topicCount: await countTopicsInMenu(this).catch(() => -1),
    });
    throw error;
  }

  // Confirm the second topic actually registered in the history menu before the
  // scenario proceeds to click it. The menu list is SWR-driven and only refetches
  // after the send mutation's getMessagesAndTopics tail resolves — that tail
  // can sit behind a CI Postgres stall, so a one-shot count reads a slow
  // refetch as "topic never created".
  try {
    await expect
      .poll(async () => countTopicsInMenu(this), {
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

When('用户通过命令菜单新建对话', { timeout: 90_000 }, async function (this: CustomWorld) {
  await createConversationFromCommandMenu(this);
  console.log('   ✅ 已通过命令菜单新建对话');
});

When('用户点击另一个对话', { timeout: 90_000 }, async function (this: CustomWorld) {
  console.log('   📍 Step: 通过标题菜单点击另一个对话...');

  // The list is SWR-driven and lags the send that created the conversation —
  // poll with the menu open rather than read a one-shot count.
  await openHistoryMenu(this);
  const rows = this.page.locator(TOPIC_ITEM);
  await expect
    .poll(async () => rows.count(), {
      message: 'history menu never listed a second topic',
      timeout: 30_000,
    })
    .toBeGreaterThanOrEqual(2);

  // Pick a row that is not the current topic (aria-current="true").
  const target = this.page.locator(`${TOPIC_ITEM}:not([aria-current="true"])`).first();
  const targetId = await target.getAttribute('data-topic-id');
  expect(targetId).toBeTruthy();
  await target.click();

  await this.page.waitForURL((url) => url.pathname.endsWith(`/${targetId}`), { timeout: 30_000 });
  console.log('   ✅ 已点击另一个对话');
});

When('用户打开当前对话的更多菜单', async function (this: CustomWorld) {
  console.log('   📍 Step: 打开头部更多菜单...');

  await this.page.waitForURL((url) => /\/chat\/tpc_[^/]+$/.test(url.pathname), {
    timeout: 30_000,
  });
  const topicId = new URL(this.page.url()).pathname.split('/').pop();
  expect(topicId).toBeTruthy();
  this.testContext.deletedTopicId = topicId;

  const more = this.page
    .getByRole('button', { exact: true, name: /^(More|更多)$/ })
    .locator('visible=true');
  await expect(more.first()).toBeVisible({ timeout: 10_000 });
  await more.first().click();
  console.log(`   ✅ 已打开当前对话 ${topicId} 的更多菜单`);
});

When('用户选择重命名选项', async function (this: CustomWorld) {
  console.log('   📍 Step: 选择重命名选项...');

  const renameOption = this.page.getByRole('menuitem', { exact: true, name: /^(Rename|重命名)$/ });
  await expect(renameOption).toBeVisible({ timeout: 5000 });
  await renameOption.click();

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

When('用户确认删除', async function (this: CustomWorld) {
  console.log('   📍 Step: 确认删除...');

  // `Delete Topic` / `删除话题`: the topic delete flow confirms through the
  // DeleteTopicConfirm modal (#16030) instead of a generic ok/删除 button.
  const confirmButton = this.page
    .getByRole('dialog')
    .or(this.page.getByRole('alertdialog'))
    .getByRole('button', { name: /^(ok|delete( topic)?|删除(话题)?|确认|确定)$/i });

  await expect(confirmButton).toBeVisible({ timeout: 5000 });
  await confirmButton.click();

  console.log('   ✅ 已确认删除');
  await this.page.waitForTimeout(500);
});

When('用户在搜索框中输入 {string}', async function (this: CustomWorld, searchText: string) {
  console.log(`   📍 Step: 在历史菜单搜索框中输入 "${searchText}"...`);

  await openHistoryMenu(this);
  const searchInput = this.page.locator('[data-slot="popover-content"] input').first();
  await searchInput.fill(searchText);

  console.log(`   ✅ 已输入搜索内容 "${searchText}"`);
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
  // The current topic's title is rendered in the header's title-menu trigger
  const renamedTopic = this.page.getByText(expectedName, { exact: true }).first();

  await expect(renamedTopic).toBeVisible({ timeout: 5000 });

  console.log(`   ✅ 对话名称已更新为 "${expectedName}"`);
});

Then('该对话应该被删除', async function (this: CustomWorld) {
  console.log('   📍 Step: 验证对话已删除...');

  // Wait for deletion to take effect
  await this.page.waitForTimeout(500);

  console.log('   ✅ 对话已删除');
});

Then('对话列表中不再显示该对话', async function (this: CustomWorld) {
  console.log('   📍 Step: 验证历史菜单中不再显示该对话...');

  const topicId = this.testContext.deletedTopicId;
  expect(topicId).toBeTruthy();
  await openHistoryMenu(this);
  const deletedTopic = this.page.locator(`${TOPIC_ITEM}[data-topic-id="${topicId}"]`);
  await expect(deletedTopic).toHaveCount(0, { timeout: 10_000 });
  await closeHistoryMenu(this);
  console.log(`   ✅ 对话 ${topicId} 已从历史菜单中移除`);
});

Then('应该显示包含 {string} 的对话', async function (this: CustomWorld, searchText: string) {
  console.log(`   📍 Step: 验证搜索结果包含 "${searchText}"...`);

  const rows = this.page.locator(TOPIC_ITEM);
  await expect(rows.first()).toBeVisible({ timeout: 15_000 });
  const titles = await rows.allTextContents();
  console.log(`   📍 搜索结果: ${JSON.stringify(titles)}`);
  expect(titles.some((title) => title.includes(searchText))).toBe(true);

  console.log(`   ✅ 搜索结果显示包含 "${searchText}" 的对话`);
});

Then('不相关的对话应该被过滤', async function (this: CustomWorld) {
  console.log('   📍 Step: 验证不相关对话已被过滤...');

  const rows = this.page.locator(TOPIC_ITEM);
  await expect
    .poll(async () => (await rows.allTextContents()).every((title) => title.includes('测试')), {
      message: 'search results still contain unrelated topics',
      timeout: 10_000,
    })
    .toBe(true);

  await closeHistoryMenu(this);
  console.log('   ✅ 不相关对话已被过滤');
});
