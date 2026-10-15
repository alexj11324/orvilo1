import { chromium } from '@playwright/test';
import { expect, it, vi } from 'vitest';

import { focusChatInput } from './conversation.steps';

vi.mock('@cucumber/cucumber', () => ({
  Given: vi.fn(),
  Then: vi.fn(),
  When: vi.fn(),
  World: class {},
  setWorldConstructor: vi.fn(),
}));

it('waits for an editable composer instead of focusing its visible loading container', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <form data-testid="chat-input" style="width:400px;padding:20px">
        <div id="editor" contenteditable="false" style="height:60px">Draft</div>
        <button type="button">Runtime controls</button>
      </form>
    `);
    await page.evaluate(() => {
      setTimeout(
        () => document.querySelector('#editor')!.setAttribute('contenteditable', 'true'),
        250,
      );
    });
    await focusChatInput.call({ page });
    expect(
      await page.locator('#editor').evaluate((editor) => editor === document.activeElement),
    ).toBe(true);
    await page.keyboard.press('End');
    await page.keyboard.type(' message');
    expect(await page.locator('#editor').textContent()).toBe('Draft message');
  } finally {
    await browser.close();
  }
});
