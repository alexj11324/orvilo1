/**
 * Home Sidebar Agent Steps
 *
 * Step definitions for Home page Agent management E2E tests
 * - Rename
 * - Pin/Unpin
 * - Delete
 */
import { randomBytes } from 'node:crypto';

import { Given, Then, When } from '@cucumber/cucumber';
import { expect } from '@playwright/test';

import { TEST_USER } from '../../support/seedTestUser';
import { type CustomWorld, WAIT_TIMEOUT } from '../../support/world';

// ============================================
// Helper Functions
// ============================================

async function inputNewName(
  this: CustomWorld,
  newName: string,
  pressEnter: boolean,
): Promise<void> {
  await this.page.waitForTimeout(300);

  // The rename EditingPopover mounts anchored to the row; while its positioner
  // animates, click/fill can wait on actionability indefinitely. Type via the
  // keyboard instead — pressSequentially only needs the input to be editable.
  // The EmojiPicker upload renders a hidden file input before the title input,
  // so target the title input explicitly.
  const renameInput = this.page
    .locator(
      'input[data-testid="editing-popover-title-input"], [data-testid="editing-popover"] input:not([type="file"])',
    )
    .first();

  try {
    await renameInput.waitFor({ state: 'visible', timeout: 5000 });
    await renameInput.focus({ timeout: 3000 });
    await this.page.keyboard.press(`${this.modKey}+a`);
    await renameInput.pressSequentially(newName, { timeout: 5000 });

    if (pressEnter) {
      await renameInput.press('Enter', { timeout: 5000 });
    } else {
      // Click the save ActionIcon — scoped by testid because the EmojiPicker
      // swatch list can render its own lucide-check marks inside the popover.
      const saveButton = this.page.locator('[data-testid="editing-popover-save"]').first();
      if ((await saveButton.count()) > 0) {
        await saveButton.click({ force: true, timeout: 5000 });
      } else {
        // Fallback: press Enter to save
        await renameInput.press('Enter', { timeout: 5000 });
      }
    }
  } catch (error) {
    const popoverHtml = await this.page
      .evaluate(() => document.querySelector('[data-testid="editing-popover"]')?.outerHTML)
      .catch(() => undefined);
    console.log(`   🔴 editing-popover DOM: ${(popoverHtml ?? 'NO POPOVER').slice(0, 2000)}`);
    throw error;
  }

  await this.page.waitForTimeout(1000);
  console.log(`   ✅ 已输入新名称 "${newName}"`);
}

/**
 * Create a test agent directly in database
 */
async function createTestAgent(title: string = 'Test Agent'): Promise<string> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not set');

  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: databaseUrl });

  try {
    await client.connect();

    const now = new Date().toISOString();
    const suffix = randomBytes(6).toString('hex');
    const agentId = `agent_e2e_test_${suffix}`;
    const slug = `test-agent-${suffix}`;

    await client.query(
      `INSERT INTO agents (id, slug, title, user_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5)
       ON CONFLICT DO NOTHING`,
      [agentId, slug, title, TEST_USER.id, now],
    );

    console.log(`   📍 Created test agent in DB: ${agentId}`);
    return agentId;
  } finally {
    await client.end();
  }
}

async function waitForAgentItem(this: CustomWorld, agentId: string) {
  // The sidebar "In Sidebar" section duplicates the same href — scope row
  // interactions to the main Agents list via [data-agent-list].
  const selector = `a[href$="/agent/${agentId}"]`;
  const rowSelector = `[data-agent-list] ${selector}`;
  const agentItem = this.page.locator(rowSelector).first();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await expect(agentItem).toBeVisible({ timeout: WAIT_TIMEOUT });
      return { agentItem, selector, rowSelector };
    } catch (error) {
      if (attempt === 2) throw error;
      console.log(`   ↻ Agent ${agentId} not visible yet, reloading Agents page...`);
      await this.page.reload({ waitUntil: 'domcontentloaded' });
      await this.page.waitForTimeout(1000);
    }
  }

  return { agentItem, selector, rowSelector };
}

// ============================================
// Given Steps
// ============================================

Given('用户在 Agents 页面有一个 Agent', { timeout: 30_000 }, async function (this: CustomWorld) {
  console.log('   📍 Step: 在数据库中创建测试 Agent...');
  const agentId = await createTestAgent('E2E Test Agent');
  this.testContext.createdAgentId = agentId;

  console.log('   📍 Step: 导航到 Agents 页面...');
  await this.page.goto('/agents');
  await this.page.waitForLoadState('domcontentloaded', { timeout: 15_000 });
  await this.page.waitForTimeout(1000);

  console.log('   📍 Step: 查找新创建的 Agent...');
  // Look for the newly created agent in the sidebar by its specific ID. Use a
  // suffix match so workspace-prefixed links (e.g. /:workspaceSlug/agent/:id)
  // are accepted as well.
  const { agentItem, selector, rowSelector } = await waitForAgentItem.call(this, agentId);

  // Store agent reference for later use
  const agentLabel = await agentItem.getAttribute('aria-label');
  this.testContext.targetItemId = agentLabel || agentId;
  this.testContext.targetItemSelector = selector;
  this.testContext.targetRowSelector = rowSelector;
  this.testContext.targetType = 'agent';

  console.log(`   ✅ 找到 Agent: ${agentLabel}, id: ${agentId}`);
});

Given('该 Agent 未显示在侧边栏', { timeout: 30_000 }, async function (this: CustomWorld) {
  console.log('   📍 Step: 检查 Agent 未显示在侧边栏...');
  // The Agents page shows in-sidebar items inside the "In Sidebar" section.
  // A freshly seeded item defaults to visible, so hide it via the row menu.
  const inSidebar = this.page
    .locator(`[data-testid="sidebar-agents-section"] ${this.testContext.targetItemSelector}`)
    .first();

  if ((await inSidebar.count()) > 0) {
    console.log('   📍 Agent 已在侧边栏，开始隐藏操作...');
    const targetItem = this.page.locator(this.testContext.targetRowSelector).first();
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
  console.log(`   ✅ Agent 未显示在侧边栏 (inSidebar=${stillVisible})`);
});

Given('该 Agent 已显示在侧边栏', { timeout: 30_000 }, async function (this: CustomWorld) {
  console.log('   📍 Step: 确保 Agent 已显示在侧边栏...');
  const inSidebar = this.page
    .locator(`[data-testid="sidebar-agents-section"] ${this.testContext.targetItemSelector}`)
    .first();

  if ((await inSidebar.count()) === 0) {
    console.log('   📍 Agent 未在侧边栏，开始显示操作...');
    const targetItem = this.page.locator(this.testContext.targetRowSelector).first();
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
  console.log(`   ✅ Agent 已显示在侧边栏: ${isVisible > 0}`);
});

// ============================================
// When Steps
// ============================================

When('用户右键点击该 Agent', { timeout: 30_000 }, async function (this: CustomWorld) {
  console.log('   📍 Step: 右键点击 Agent...');

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
    console.log('   ⚠️ 菜单未出现，重试右键点击...');
  });

  // Debug: check what menus are visible
  const menuItems = await this.page.locator('[role="menuitem"]').count();
  console.log(`   📍 Debug: Found ${menuItems} menu items after right-click`);

  console.log('   ✅ 已右键点击 Agent');
});

When('用户悬停在该 Agent 上', async function (this: CustomWorld) {
  console.log('   📍 Step: 悬停在 Agent 上...');

  const targetItem = this.page.locator(this.testContext.targetRowSelector).first();
  await targetItem.hover();
  await this.page.waitForTimeout(500);

  console.log('   ✅ 已悬停在 Agent 上');
});

When('用户点击更多操作按钮', async function (this: CustomWorld) {
  console.log('   📍 Step: 点击更多操作按钮...');

  // The "…" trigger is a sibling of the row anchor (inside the row's trailing
  // cluster), never inside the <a> itself — scope via the row parent.
  const targetItem = this.page.locator(this.testContext.targetRowSelector).first();
  const row = targetItem.locator('xpath=..');
  const moreButton = row.locator('svg.lucide-ellipsis').first();

  await moreButton.waitFor({ state: 'visible', timeout: 5000 });
  // Hover activates the lazily-mounted dropdown trigger before clicking.
  await moreButton.hover();
  await moreButton.click();

  await this.page.waitForTimeout(500);
  console.log('   ✅ 已点击更多操作按钮');
});

When('用户在菜单中选择重命名', async function (this: CustomWorld) {
  console.log('   📍 Step: 选择重命名选项...');

  const renameOption = this.page.getByRole('menuitem', { name: /^(rename|重命名)$/i });
  await expect(renameOption).toBeVisible({ timeout: 5000 });
  await renameOption.click();
  await this.page.waitForTimeout(500);

  console.log('   ✅ 已选择重命名选项');
});

When('用户在菜单中选择加入侧边栏', async function (this: CustomWorld) {
  console.log('   📍 Step: 选择加入侧边栏选项...');

  const showOption = this.page.getByRole('menuitem', {
    name: /在我的侧边栏显示|show in my sidebar/i,
  });
  await expect(showOption).toBeVisible({ timeout: 5000 });
  await showOption.click();
  await this.page.waitForTimeout(800);

  console.log('   ✅ 已选择加入侧边栏选项');
});

When('用户在菜单中选择移出侧边栏', async function (this: CustomWorld) {
  console.log('   📍 Step: 选择移出侧边栏选项...');

  const hideOption = this.page.getByRole('menuitem', {
    name: /在我的侧边栏隐藏|hide from my sidebar/i,
  });
  await expect(hideOption).toBeVisible({ timeout: 5000 });
  await hideOption.click();
  await this.page.waitForTimeout(800);

  console.log('   ✅ 已选择移出侧边栏选项');
});

When('用户在菜单中选择删除', async function (this: CustomWorld) {
  console.log('   📍 Step: 选择删除选项...');

  const deleteOption = this.page.getByRole('menuitem', { name: /^(delete|删除)$/i });
  await expect(deleteOption).toBeVisible({ timeout: 5000 });
  await deleteOption.click();
  await this.page.waitForTimeout(300);

  console.log('   ✅ 已选择删除选项');
});

When('用户在弹窗中确认删除', async function (this: CustomWorld) {
  console.log('   📍 Step: 确认删除...');

  const confirmButton = this.page
    .getByRole('dialog')
    .getByRole('button', { name: /^(ok|delete|删除|确认|确定)$/i });
  await expect(confirmButton).toBeVisible({ timeout: 5000 });
  await confirmButton.click();
  await this.page.waitForTimeout(500);

  console.log('   ✅ 已确认删除');
});

When('用户输入新的名称 {string}', async function (this: CustomWorld, newName: string) {
  console.log(`   📍 Step: 输入新名称 "${newName}"...`);
  await inputNewName.call(this, newName, false);
});

When('用户输入新的名称 {string} 并按 Enter', async function (this: CustomWorld, newName: string) {
  console.log(`   📍 Step: 输入新名称 "${newName}" 并按 Enter...`);
  await inputNewName.call(this, newName, true);
});

// ============================================
// Then Steps
// ============================================

Then('该项名称应该更新为 {string}', async function (this: CustomWorld, expectedName: string) {
  console.log(`   📍 Step: 验证名称为 "${expectedName}"...`);

  await this.page.waitForTimeout(1000);
  const renamedItem = this.page.getByText(expectedName, { exact: true }).first();
  try {
    await expect(renamedItem).toBeVisible({ timeout: 5000 });
  } catch (error) {
    // Dump the target row + popover state so the failure shows whether the
    // rename saved a different value, the popover stayed open, or the list
    // simply didn't refresh.
    const rowText = this.testContext.targetRowSelector
      ? await this.page
          .locator(this.testContext.targetRowSelector)
          .first()
          .textContent()
          .catch(() => 'ROW NOT FOUND')
      : 'no row selector';
    const popoverOpen = await this.page
      .locator('[data-testid="editing-popover"]')
      .count()
      .catch(() => -1);
    console.log(`   🔴 row text: ${rowText}`);
    console.log(`   🔴 editing-popover still mounted: ${popoverOpen}`);
    throw error;
  }

  console.log(`   ✅ 名称已更新为 "${expectedName}"`);
});

Then('Agent 应该显示在侧边栏分组中', async function (this: CustomWorld) {
  console.log('   📍 Step: 验证 Agent 显示在侧边栏分组中...');

  await this.page.waitForTimeout(500);
  const sectionItem = this.page
    .locator(`[data-testid="sidebar-agents-section"] ${this.testContext.targetItemSelector}`)
    .first();
  await expect(sectionItem).toBeVisible({ timeout: 5000 });

  console.log('   ✅ Agent 已显示在侧边栏分组中');
});

Then('Agent 不应该显示在侧边栏分组中', async function (this: CustomWorld) {
  console.log('   📍 Step: 验证 Agent 不在侧边栏分组中...');

  await this.page.waitForTimeout(500);
  const sectionItem = this.page.locator(
    `[data-testid="sidebar-agents-section"] ${this.testContext.targetItemSelector}`,
  );
  await expect(sectionItem).not.toBeVisible({ timeout: 5000 });

  console.log('   ✅ Agent 不在侧边栏分组中');
});

Then('Agent 应该从列表中移除', async function (this: CustomWorld) {
  console.log('   📍 Step: 验证 Agent 已移除...');

  await this.page.waitForTimeout(500);

  // Use unique selector based on agent ID (href) to avoid false positives
  // when multiple agents have the same name
  if (this.testContext.targetItemSelector) {
    const deletedItem = this.page.locator(this.testContext.targetItemSelector);
    await expect(deletedItem).not.toBeVisible({ timeout: 5000 });
  }

  console.log('   ✅ Agent 已从列表中移除');
});
