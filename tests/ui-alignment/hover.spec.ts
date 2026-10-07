import { expect, type Locator, type Page, test } from '@playwright/test';

import {
  assertHoverCoverage,
  assertHoverFeedback,
  hasVisibleHover,
} from '../../scripts/ci/hoverFeedback.mjs';

const required = [
  ...['default', 'outline', 'secondary', 'ghost', 'destructive', 'link'].map((v) => `button-${v}`),
  ...['borderless', 'outlined', 'filled'].map((v) => `icon-${v}`),
  'status',
  'priority',
  'assignee',
  'labels',
  'schedule',
  'reviewer',
  'due-date',
  'project',
  'milestone',
  'project-link',
  'filter-all',
  'filter-comments',
  'filter-updates',
  'tooltip-button',
  'pseudo-wash',
  'shared-role',
  'selected-role',
  'colored-shadow',
  'opaque-thumbnail',
];

async function paint(control: Locator) {
  return control.evaluate((element) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const rgba = (color: string) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, alpha] = ctx.getImageData(0, 0, 1, 1).data;
      return [r, g, b, alpha / 255];
    };
    const read = (pseudo?: string) => {
      const style = getComputedStyle(element, pseudo);
      const shadowColors =
        style.boxShadow.match(/(?:rgba?|color|oklch|oklab|hsla?)\([^)]*\)/g) ?? [];
      const shadowLengths =
        style.boxShadow
          .replaceAll(/(?:rgba?|color|oklch|oklab|hsla?)\([^)]*\)/g, '')
          .match(/-?[\d.]+px/g) ?? [];
      return {
        background: rgba(style.backgroundColor),
        opacity: Number(style.opacity),
        shadow: style.boxShadow,
        shadowVisible:
          shadowColors.some((color) => rgba(color)[3] > 0) &&
          shadowLengths.some((length) => Math.abs(Number.parseFloat(length)) > 0),
        visible:
          !pseudo ||
          (style.content !== 'none' && style.content !== 'normal' && style.display !== 'none'),
      };
    };
    let backdrop = [255, 255, 255];
    const ancestors: Element[] = [];
    for (let parent = element.parentElement; parent; parent = parent.parentElement)
      ancestors.unshift(parent);
    for (const parent of ancestors) {
      const fill = rgba(getComputedStyle(parent).backgroundColor);
      backdrop = backdrop.map((value, i) => fill[i] * fill[3] + value * (1 - fill[3]));
    }
    return { ...read(), backdrop, pseudos: [read('::before'), read('::after')] };
  });
}

async function measure(page: Page, control: Locator) {
  await control.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(250);
  const before = await paint(control);
  await control.hover();
  await page.waitForTimeout(250);
  const after = await paint(control);
  return { before, after };
}

for (const theme of ['light', 'dark']) {
  test(`enabled controls require visible hover paint / ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1024, height: 1200 });
    await page.goto(`/?theme=${theme}`);
    const fixture = page.getByTestId('hover-fixture');
    await expect(fixture).toBeVisible();
    const controls = fixture.locator(
      'button, [role="button"], [data-slot="dropdown-menu-trigger"], [data-slot="popover-trigger"]',
    );
    const names: string[] = [];
    const diagnostics: Record<string, unknown> = {
      commit: process.env.UI_ALIGNMENT_SHA,
      theme,
      controls: [],
    };
    const results: Record<string, unknown>[] = [];
    try {
      for (const control of await controls.all()) {
        if (!(await control.isVisible())) continue;
        if (await control.getAttribute('data-hover-negative')) continue;
        const exception = await control.getAttribute('data-hover-exception');
        if (exception) {
          expect(['disabled', 'loading', 'permission']).toContain(exception);
          expect(await control.isEnabled(), `${exception} genuinely disables activation`).toBe(
            false,
          );
          continue;
        }
        const name = await control.getAttribute('data-hover-kind');
        expect(name, 'every enabled fixture control belongs to the required roster').not.toBeNull();
        names.push(name!);
        const measurement = await measure(page, control);
        results.push({ name, ...measurement });
        assertHoverFeedback(name, measurement.before, measurement.after);
        const popup = await control.getAttribute('aria-haspopup');
        if (popup) {
          await control.click();
          await expect(control).toHaveAttribute('aria-expanded', 'true');
          await page.keyboard.press('Escape');
          await expect(control).toHaveAttribute('aria-expanded', 'false');
        } else {
          const clicks = Number(await page.getByTestId('hover-clicks').textContent());
          await control.click();
          await expect(page.getByTestId('hover-clicks')).toHaveText(String(clicks + 1));
        }
      }
      assertHoverCoverage(names, required, 28);
      for (const name of ['unstyled', 'text-only', 'ancestor-only', 'same-color-pseudo']) {
        const measurement = await measure(page, fixture.locator(`[data-hover-negative="${name}"]`));
        results.push({ name, negative: true, ...measurement });
        expect(
          hasVisibleHover(measurement.before, measurement.after),
          `${name} must fail the same judge`,
        ).toBe(false);
        expect(() => assertHoverFeedback(name, measurement.before, measurement.after)).toThrow(
          /no visible hover/,
        );
      }
      await page
        .getByTestId('hover-fixture')
        .screenshot({ path: testInfo.outputPath(`hover-${theme}.png`) });
    } finally {
      diagnostics.controls = results;
      await testInfo.attach('hover-feedback', {
        body: JSON.stringify(diagnostics, null, 2),
        contentType: 'application/json',
      });
    }
  });
}
