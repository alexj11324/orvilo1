import { expect, test } from '@playwright/test';

for (const width of [1280, 900]) {
  for (const theme of ['light', 'dark']) {
    for (const palette of ['default', 'custom', 'yellow']) {
      test(`production feature geometry and portals: ${width} ${theme} ${palette}`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`/design.html?theme=${theme}&palette=${palette}&language=zh`, {
          waitUntil: 'domcontentloaded',
        });
        await expect(page.getByTestId('open-api-key')).toBeVisible();
        await expect(page.getByTestId('mcp-feature').locator('[data-slot="card"]')).toHaveCount(2);
        for (const card of await page
          .getByTestId('mcp-feature')
          .locator('[data-slot="card"]')
          .all()) {
          await expect(card).toHaveCSS('border-radius', '8px');
        }
        await expect(
          page.getByTestId('badge-probes').locator('[data-slot="badge"]').first(),
        ).toHaveCSS('border-radius', '4px');
        await expect(page.getByTestId('retained-rail-value')).toHaveCSS('font-size', '13px');

        const primary = page.locator('[data-hover-kind="button-default"]');
        await primary.scrollIntoViewIfNeeded();
        const before = await primary.boundingBox();
        const beforeFocus = await primary.evaluate(
          (element) => getComputedStyle(element).boxShadow,
        );
        await primary.hover();
        expect(await primary.boundingBox()).toEqual(before);
        await primary.focus();
        await expect(primary).toBeFocused();
        await expect
          .poll(() => primary.evaluate((element) => getComputedStyle(element).boxShadow))
          .not.toBe(beforeFocus);

        await page.getByTestId('menu-trigger').click();
        await expect(page.getByRole('menu')).toHaveCSS('border-radius', '12px');
        await page.getByRole('menuitem').click();
        await expect(page.getByRole('menu')).toBeHidden();

        await page.getByTestId('project-filter-feature').getByRole('button').first().click();
        await expect(page.locator('[data-slot="popover-content"]')).toHaveCSS(
          'border-radius',
          '12px',
        );
        await page
          .locator('[data-slot="popover-content"]')
          .getByRole('option', { name: '里程碑', exact: true })
          .click();
        await expect(
          page.getByText('发布验收与项目里程碑 — 长标签覆盖', { exact: true }),
        ).toBeVisible();
        await page.getByText('发布验收与项目里程碑 — 长标签覆盖', { exact: true }).click();
        await page.keyboard.press('Escape');

        await page.getByTestId('open-api-key').click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toHaveCSS('border-radius', '12px');
        await expect(dialog.locator('[data-slot="input"]').first()).toHaveCSS('height', '36px');
        await expect(dialog.locator('[data-slot="select-trigger"]')).toHaveCSS('height', '36px');
        await expect(dialog.locator('button[type="submit"]')).toHaveCSS('height', '36px');
        await dialog.locator('button[type="submit"]').click();
        await expect(dialog.locator('.ant-form-item-explain-error')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
      });
    }
  }
}

for (const motion of ['disabled', 'reduced']) {
  test(`actual API key portal and loader stop under ${motion} motion`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: motion === 'reduced' ? 'reduce' : 'no-preference' });
    await page.addInitScript(() => {
      const state = window as typeof window & {
        mcpFirstPaint?: { opacity: string; transform: string };
      };
      new MutationObserver(() => {
        const header = document.querySelector('[data-testid="mcp-feature"] > div > div');
        if (header && !state.mcpFirstPaint) {
          const style = getComputedStyle(header);
          state.mcpFirstPaint = { opacity: style.opacity, transform: style.transform };
        }
      }).observe(document, { childList: true, subtree: true });
    });
    await page.goto(`/design.html?theme=dark&motion=${motion}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('mcp-feature')).toBeVisible();
    const firstPaint = await page.evaluate(
      () =>
        (window as typeof window & { mcpFirstPaint?: { opacity: string; transform: string } })
          .mcpFirstPaint,
    );
    expect(firstPaint).toEqual({ opacity: '1', transform: 'none' });
    await expect(
      page.getByTestId('task-feature').locator('[data-slot="accordion-arrow"]'),
    ).toHaveCSS('transition-duration', '0s');
    await expect(page.getByTestId('motion-spinner')).toHaveCSS('animation-name', 'none');
    await page.getByTestId('open-api-key').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCSS('animation-name', 'none');
    await expect(page.getByRole('dialog')).toHaveCSS('transition-duration', '0s');
    await expect(page.locator('[data-slot="dialog-overlay"]')).toHaveCSS('animation-name', 'none');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
  });
}

test('light server theme does not mask document dark fallback before theme resolution', async ({
  page,
}) => {
  await page.goto('/design.html?theme=dark&engine=light', { waitUntil: 'domcontentloaded' });
  const primary = page.locator('[data-hover-kind="button-default"]');
  await expect(primary).toBeVisible();
  const colors = await primary.evaluate((element) => {
    const style = getComputedStyle(element);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d')!;
    const sample = (color: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data];
    };
    return { foreground: sample(style.color), background: sample(style.backgroundColor) };
  });
  expect(colors.background[0]).toBeGreaterThan(200);
  expect(colors.foreground[0]).toBeLessThan(80);
});

for (const theme of ['light', 'dark']) {
  for (const palette of ['default', 'custom', 'yellow']) {
    test(`rendered status/action color pairs: ${theme} ${palette}`, async ({ page }) => {
      await page.goto(`/design.html?theme=${theme}&palette=${palette}`, {
        waitUntil: 'domcontentloaded',
      });
      await expect(page.getByTestId('open-api-key')).toBeVisible();
      const contrast = async (selector: string, property: 'color' | 'borderTopColor' = 'color') =>
        page.locator(selector).evaluateAll((elements, property) => {
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 1;
          const context = canvas.getContext('2d')!;
          const sample = (color: string) => {
            context.clearRect(0, 0, 1, 1);
            context.fillStyle = color;
            context.fillRect(0, 0, 1, 1);
            return [...context.getImageData(0, 0, 1, 1).data];
          };
          const blend = (foreground: number[], background: number[]) =>
            foreground
              .slice(0, 3)
              .map(
                (value, index) =>
                  (value * foreground[3]) / 255 + background[index] * (1 - foreground[3] / 255),
              );
          const luminance = (rgb: number[]) =>
            rgb
              .slice(0, 3)
              .map((value) => value / 255)
              .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
              .reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0);
          return elements.map((element) => {
            const style = getComputedStyle(element);
            const ancestors: Element[] = [];
            for (let current = element.parentElement; current; current = current.parentElement)
              ancestors.unshift(current);
            let background = sample(
              getComputedStyle(document.documentElement).getPropertyValue('--background'),
            ).slice(0, 3);
            for (const ancestor of [...ancestors, element])
              background = blend(sample(getComputedStyle(ancestor).backgroundColor), [
                ...background,
                255,
              ]);
            const foreground = blend(sample(style[property]), [...background, 255]);
            const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
            return { text: element.textContent, contrast: (values[0] + 0.05) / (values[1] + 0.05) };
          });
        }, property);
      for (const pair of await contrast('[data-testid="badge-probes"] [data-slot="badge"]')) {
        expect(pair.contrast, pair.text ?? '').toBeGreaterThanOrEqual(4.5);
      }
      for (const variant of ['default', 'destructive']) {
        const selector = `[data-hover-kind="button-${variant}"]`;
        for (const pair of await contrast(selector))
          expect(pair.contrast, `${variant} default`).toBeGreaterThanOrEqual(4.5);
        await page.locator(selector).hover();
        await page.waitForTimeout(180);
        for (const pair of await contrast(selector))
          expect(pair.contrast, `${variant} hover`).toBeGreaterThanOrEqual(4.5);
      }
      await page.getByTestId('open-api-key').click();
      const dialog = page.getByRole('dialog');
      const input = dialog.locator('[data-slot="input"]').first();
      await expect(input).toBeVisible();
      for (const pair of await contrast('[role="dialog"] [data-slot="input"]', 'borderTopColor'))
        expect(pair.contrast, 'normal input boundary on modal surface').toBeGreaterThanOrEqual(3);
      await dialog.locator('button[type="submit"]').click();
      await expect(dialog.locator('.ant-form-item-explain-error')).toBeVisible();
      await expect(input).toHaveAttribute('aria-invalid', 'true');
      for (const pair of await contrast('[role="dialog"] .ant-form-item-explain-error'))
        expect(pair.contrast, 'validation error text on modal surface').toBeGreaterThanOrEqual(4.5);
      for (const pair of await contrast('[role="dialog"] [aria-invalid="true"]', 'borderTopColor'))
        expect(pair.contrast, 'invalid input boundary on modal surface').toBeGreaterThanOrEqual(3);
      await dialog.locator('[data-slot="select-trigger"]').click();
      await page.getByRole('option', { name: /custom/i }).click();
      const date = dialog.getByRole('button', { name: 'Select a date', exact: true });
      await expect(date).toHaveCSS('height', '36px');
      await expect(date).toHaveCSS('border-radius', '6px');
      await expect(dialog.locator('button[type="submit"]')).toBeDisabled();
    });
  }
}

for (const host of ['share', 'workbench']) {
  test(`standalone ${host} host loads its shared stylesheet`, async ({ page }) => {
    for (const theme of ['light', 'dark']) {
      await page.goto(`/standaloneTheme.html?host=${host}&theme=${theme}`, {
        waitUntil: 'domcontentloaded',
      });
      const button = page.getByTestId('standalone-button');
      await expect(button).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.locator('body')).toHaveCSS('margin', '0px');
      const content = page.getByTestId('standalone-content');
      await expect(content).toHaveCSS('display', 'flex');
      await expect(content).toHaveCSS('gap', '16px');
      await expect(content).toHaveCSS('padding', '16px');
      await expect(button).toHaveCSS('height', '32px');
      await expect(button).toHaveCSS('border-radius', '8px');
      const colors = await button.evaluate((element) => {
        const sample = document.createElement('span');
        document.body.append(sample);
        sample.style.backgroundColor = 'var(--primary)';
        sample.style.color = 'var(--primary-foreground)';
        const expected = getComputedStyle(sample);
        const actual = getComputedStyle(element);
        const result = {
          actualBackground: actual.backgroundColor,
          actualForeground: actual.color,
          expectedBackground: expected.backgroundColor,
          expectedForeground: expected.color,
        };
        sample.remove();
        return result;
      });
      expect(colors.actualBackground).toBe(colors.expectedBackground);
      expect(colors.actualForeground).toBe(colors.expectedForeground);
    }
  });
}
