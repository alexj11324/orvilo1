/**
 * Home Sidebar Agent Group Steps
 *
 * Step definitions for Home page Agent Group management E2E tests
 * - Rename
 * - Pin/Unpin
 * - Delete
 */
import { randomBytes } from 'node:crypto';

import { Given, Then, When } from '@cucumber/cucumber';
import { expect } from '@playwright/test';

import { TEST_USER } from '../../support/seedTestUser';
import type { CustomWorld } from '../../support/world';
import { WAIT_TIMEOUT } from '../../support/world';

/**
 * Create a test chat group directly in database
 */
async function createTestGroup(title: string = 'Test Group'): Promise<string> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not set');

  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: databaseUrl });

  try {
    await client.connect();

    const now = new Date().toISOString();
    const groupId = `group_e2e_test_${randomBytes(6).toString('hex')}`;

    await client.query(
      `INSERT INTO chat_groups (id, title, user_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $4)
       ON CONFLICT DO NOTHING`,
      [groupId, title, TEST_USER.id, now],
    );

    console.log(`   📍 Created test group in DB: ${groupId}`);
    return groupId;
  } finally {
    await client.end();
  }
}

async function waitForGroupItem(this: CustomWorld, groupId: string) {
  const selector = `a[href$="/group/${groupId}"]`;
  const groupItem = this.page.locator(selector).first();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await expect(groupItem).toBeVisible({ timeout: WAIT_TIMEOUT });
      return { groupItem, selector };
    } catch (error) {
      if (attempt === 2) throw error;
      console.log(`   ↻ Agent Group ${groupId} not visible yet, reloading Home page...`);
      await this.page.reload({ waitUntil: 'domcontentloaded' });
      await this.page.waitForTimeout(1000);
    }
  }

  return { groupItem, selector };
}

// ============================================
// Given Steps
// ============================================

Given('用户在 Agents 页面有一个 Agent Group', async function (this: CustomWorld) {
  console.log('   📍 Step: 在数据库中创建测试 Agent Group...');
  const groupId = await createTestGroup('E2E Test Group');
  this.testContext.createdGroupId = groupId;

  console.log('   📍 Step: 导航到 Agents 页面...');
  await this.page.goto('/agents');
  await this.page.waitForLoadState('domcontentloaded', { timeout: 15_000 });
  await this.page.waitForTimeout(1000);

  console.log('   📍 Step: 查找新创建的 Agent Group...');
  const { groupItem, selector } = await waitForGroupItem.call(this, groupId);

  const groupLabel = await groupItem.getAttribute('aria-label');
  this.testContext.targetItemId = groupLabel || groupId;
  this.testContext.targetItemSelector = selector;
  this.testContext.targetType = 'group';

  console.log(`   ✅ 找到 Agent Group: ${groupLabel}, id: ${groupId}`);
});

Given('该 Agent Group 未显示在侧边栏', { timeout: 30_000 }, async function (this: CustomWorld) {
  console.log('   📍 Step: 检查 Agent Group 未显示在侧边栏...');
  const inSidebar = this.page
    .locator(`[data-testid="sidebar-agents-section"] ${this.testContext.targetItemSelector}`)
    .first();

  if ((await inSidebar.count()) > 0) {
    console.log('   📍 Agent Group 已在侧边栏，开始隐藏操作...');
    const targetItem = this.page.locator(this.testContext.targetItemSelector).first();
    await targetItem.hover();
    await this.page.waitForTimeout(200);
    await targetItem.click({ button: 'right', force: true });
    await this.page.waitForTimeout(500);
    const hideOption = this.page.getByRole('menuitem', {
      name: /在我的侧边栏隐藏|hide from my sidebar/i,
    });
    await hideOption.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {
      console.log('   ⚠️ 隐藏选项未找到');
    });
    if ((await hideOption.count()) > 0) {
      await hideOption.click();
      await this.page.waitForTimeout(800);
    }
    // Close menu if still open
    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(300);
  }

  const stillVisible = await this.page
    .locator(`[data-testid="sidebar-agents-section"] ${this.testContext.targetItemSelector}`)
    .count();
  console.log(`   ✅ Agent Group 未显示在侧边栏 (inSidebar=${stillVisible})`);
});

Given('该 Agent Group 已显示在侧边栏', { timeout: 30_000 }, async function (this: CustomWorld) {
  console.log('   📍 Step: 确保 Agent Group 已显示在侧边栏...');
  const inSidebar = this.page
    .locator(`[data-testid="sidebar-agents-section"] ${this.testContext.targetItemSelector}`)
    .first();

  if ((await inSidebar.count()) === 0) {
    console.log('   📍 Agent Group 未在侧边栏，开始显示操作...');
    const targetItem = this.page.locator(this.testContext.targetItemSelector).first();
    await targetItem.hover();
    await this.page.waitForTimeout(200);
    await targetItem.click({ button: 'right', force: true });
    await this.page.waitForTimeout(500);

    const menuItems = await this.page.locator('[role="menuitem"]').count();
    console.log(`   📍 Debug: 发现 ${menuItems} 个菜单项`);

    const showOption = this.page.getByRole('menuitem', {
      name: /在我的侧边栏显示|show in my sidebar/i,
    });
    await showOption.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {
      console.log('   ⚠️ 显示选项未找到');
    });
    if ((await showOption.count()) > 0) {
      await showOption.click();
      await this.page.waitForTimeout(800);
      console.log('   ✅ 已点击显示选项');
    }
    // Close menu if still open
    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(300);
  }

  const isVisible = await this.page
    .locator(`[data-testid="sidebar-agents-section"] ${this.testContext.targetItemSelector}`)
    .count();
  console.log(`   ✅ Agent Group 已显示在侧边栏: ${isVisible > 0}`);
});

// ============================================
// When Steps
// ============================================

When('用户右键点击该 Agent Group', { timeout: 30_000 }, async function (this: CustomWorld) {
  console.log('   📍 Step: 右键点击 Agent Group...');

  const targetItem = this.page.locator(this.testContext.targetItemSelector).first();

  // Hover first to ensure element is interactive
  await targetItem.hover();
  await this.page.waitForTimeout(200);

  // Right-click with force option to ensure it triggers
  await targetItem.click({ button: 'right', force: true });
  await this.page.waitForTimeout(500);

  // Wait for context menu to appear
  const menuItem = this.page.locator('[role="menuitem"]').first();
  await menuItem.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {
    console.log('   ⚠️ 菜单未出现');
  });

  const menuItems = await this.page.locator('[role="menuitem"]').count();
  console.log(`   📍 Debug: Found ${menuItems} menu items after right-click`);

  console.log('   ✅ 已右键点击 Agent Group');
});

When('用户悬停在该 Agent Group 上', async function (this: CustomWorld) {
  console.log('   📍 Step: 悬停在 Agent Group 上...');

  const targetItem = this.page.locator(this.testContext.targetItemSelector).first();
  await targetItem.hover();
  await this.page.waitForTimeout(500);

  console.log('   ✅ 已悬停在 Agent Group 上');
});

// ============================================
// Then Steps
// ============================================

Then('Agent Group 应该显示在侧边栏分组中', async function (this: CustomWorld) {
  console.log('   📍 Step: 验证 Agent Group 显示在侧边栏分组中...');

  await this.page.waitForTimeout(500);
  const sectionItem = this.page
    .locator(`[data-testid="sidebar-agents-section"] ${this.testContext.targetItemSelector}`)
    .first();
  await expect(sectionItem).toBeVisible({ timeout: 5000 });

  console.log('   ✅ Agent Group 已显示在侧边栏分组中');
});

Then('Agent Group 不应该显示在侧边栏分组中', async function (this: CustomWorld) {
  console.log('   📍 Step: 验证 Agent Group 不在侧边栏分组中...');

  await this.page.waitForTimeout(500);
  const sectionItem = this.page.locator(
    `[data-testid="sidebar-agents-section"] ${this.testContext.targetItemSelector}`,
  );
  await expect(sectionItem).not.toBeVisible({ timeout: 5000 });

  console.log('   ✅ Agent Group 不在侧边栏分组中');
});

Then('Agent Group 应该从列表中移除', async function (this: CustomWorld) {
  console.log('   📍 Step: 验证 Agent Group 已移除...');

  await this.page.waitForTimeout(500);

  const deletedItem = this.page.locator(this.testContext.targetItemSelector);
  await expect(deletedItem).not.toBeVisible({ timeout: 5000 });

  console.log('   ✅ Agent Group 已从列表中移除');
});
