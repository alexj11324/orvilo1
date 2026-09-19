/**
 * Home Sidebar Agent Group Steps
 *
 * Step definitions for Home page Agent Group management E2E tests
 * - Rename
 * - Delete
 *
 * The per-group sidebar pin/show-hide scenarios were removed with the fixed
 * sidebar IA (sidebarContract.ts) — see the matching feature file comment.
 */
import { randomBytes } from 'node:crypto';

import { Given, Then, When } from '@cucumber/cucumber';
import { expect } from '@playwright/test';

import { TEST_USER } from '../../support/seedTestUser';
import type { CustomWorld } from '../../support/world';
import { WAIT_TIMEOUT } from '../../support/world';

type DbClient = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

/**
 * Resolve the signed-in test user's auto-provisioned workspace — see
 * sidebarAgent.steps.ts for why fixtures must file into the workspace.
 */
async function getTestWorkspaceId(client: DbClient): Promise<string> {
  const { rows } = await client.query(
    `SELECT workspace_id FROM workspace_members
     WHERE user_id = $1 AND deleted_at IS NULL
     ORDER BY joined_at LIMIT 1`,
    [TEST_USER.id],
  );
  const workspaceId = rows[0]?.workspace_id as string | undefined;
  if (!workspaceId) {
    throw new Error(
      `no workspace membership for ${TEST_USER.id} — workspace was not provisioned before seeding`,
    );
  }
  return workspaceId;
}

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
    const workspaceId = await getTestWorkspaceId(client);

    await client.query(
      `INSERT INTO chat_groups (id, title, user_id, workspace_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING`,
      [groupId, title, TEST_USER.id, workspaceId, now, now],
    );

    console.log(`   📍 Created test group in DB: ${groupId}`);
    return groupId;
  } finally {
    await client.end();
  }
}

async function waitForGroupItem(this: CustomWorld, groupId: string) {
  // The sidebar "In Sidebar" section duplicates the same href — scope row
  // interactions to the main Agents list via [data-agent-list].
  const selector = `a[href$="/group/${groupId}"]`;
  const rowSelector = `[data-agent-list] ${selector}`;
  const groupItem = this.page.locator(rowSelector).first();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await expect(groupItem).toBeVisible({ timeout: WAIT_TIMEOUT });
      return { groupItem, selector, rowSelector };
    } catch (error) {
      if (attempt === 2) throw error;
      console.log(`   ↻ Agent Group ${groupId} not visible yet, reloading Agents page...`);
      await this.page.reload({ waitUntil: 'domcontentloaded' });
      await this.page.waitForTimeout(1000);
    }
  }

  return { groupItem, selector, rowSelector };
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
  const { groupItem, selector, rowSelector } = await waitForGroupItem.call(this, groupId);

  const groupLabel = await groupItem.getAttribute('aria-label');
  this.testContext.targetItemId = groupLabel || groupId;
  this.testContext.targetItemSelector = selector;
  this.testContext.targetRowSelector = rowSelector;
  this.testContext.targetType = 'group';

  console.log(`   ✅ 找到 Agent Group: ${groupLabel}, id: ${groupId}`);
});

// ============================================
// When Steps
// ============================================

When('用户右键点击该 Agent Group', { timeout: 30_000 }, async function (this: CustomWorld) {
  console.log('   📍 Step: 右键点击 Agent Group...');

  const targetItem = this.page.locator(this.testContext.targetRowSelector).first();

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

  const targetItem = this.page.locator(this.testContext.targetRowSelector).first();
  await targetItem.hover();
  await this.page.waitForTimeout(500);

  console.log('   ✅ 已悬停在 Agent Group 上');
});

// ============================================
// Then Steps
// ============================================

Then('Agent Group 应该从列表中移除', async function (this: CustomWorld) {
  console.log('   📍 Step: 验证 Agent Group 已移除...');

  await this.page.waitForTimeout(500);

  const deletedItem = this.page.locator(this.testContext.targetItemSelector);
  await expect(deletedItem).not.toBeVisible({ timeout: 5000 });

  console.log('   ✅ Agent Group 已从列表中移除');
});
