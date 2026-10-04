import { expect, type Locator, test } from '@playwright/test';

const sizes = [
  { block: 24, glyph: 14, id: 'small' },
  { block: 36, glyph: 20, id: 'middle' },
  { block: 44, glyph: 24, id: 'large' },
  { block: 32.4, glyph: 18, id: 'numeric' },
  { block: 30, glyph: 18, id: 'custom' },
  { block: 40, glyph: 20, id: 'css-size' },
  { block: 24, glyph: 12, id: 'icon-style' },
  { block: 24, glyph: 14, id: 'outlined' },
  { block: 24, glyph: 14, id: 'filled' },
];

async function geometry(locator: Locator) {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      centerX: rect.x + rect.width / 2,
      centerY: rect.y + rect.height / 2,
      cssHeight: Number.parseFloat(style.height),
      cssWidth: Number.parseFloat(style.width),
      height: rect.height,
      padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft],
      width: rect.width,
    };
  });
}

function near(actual: number, expected: number, message: string) {
  expect.soft(Math.abs(actual - expected), message).toBeLessThanOrEqual(0.5);
}

for (const theme of ['light', 'dark']) {
  for (const width of [360, 1024]) {
    for (const text of ['en', 'zh', 'long']) {
      test(`${theme} / ${width}px / ${text}`, async ({ page }, testInfo) => {
        const diagnostics: Record<string, unknown> = {
          commit: process.env.UI_ALIGNMENT_SHA,
          text,
          theme,
          width,
        };
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.setViewportSize({ height: 900, width });
        await page.goto(
          `/?theme=${theme}&language=${text === 'zh' ? 'zh' : 'en'}&text=${text === 'long' ? 'long' : 'short'}`,
        );
        await expect(page.getByTestId('action-small')).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        try {
          const buttonColors = await page.getByTestId('primary-button').evaluate((element) => {
            const reference = document.querySelector('[data-testid="primary-foreground"]')!;
            const style = getComputedStyle(element);
            return {
              background: style.backgroundColor,
              expectedForeground: getComputedStyle(reference).color,
              foreground: style.color,
            };
          });
          diagnostics.primaryButton = buttonColors;
          expect
            .soft(buttonColors.foreground, 'primary button honors its foreground token')
            .toBe(buttonColors.expectedForeground);
          expect
            .soft(buttonColors.foreground, 'primary button label differs from its fill')
            .not.toBe(buttonColors.background);
          for (const { block, glyph, id } of sizes) {
            for (const prefix of id === 'icon-style' || id === 'outlined' || id === 'filled'
              ? ['']
              : ['action-', 'loading-']) {
              const name = `${prefix}${id}`;
              const button = page.getByTestId(name);
              const box = await geometry(button);
              const icon = await geometry(button.locator('svg'));
              diagnostics[name] = { box, icon };
              near(box.width, block, `${name} button width`);
              near(box.height, block, `${name} button height`);
              expect
                .soft(box.padding, `${name} icon button padding`)
                .toEqual(['0px', '0px', '0px', '0px']);
              near(icon.cssWidth, glyph, `${name} SVG width`);
              near(icon.cssHeight, glyph, `${name} SVG height`);
              near(icon.centerX, box.centerX, `${name} SVG horizontal center`);
              near(icon.centerY, box.centerY, `${name} SVG vertical center`);
              if (prefix === 'loading-') await expect(button).toBeDisabled();
            }
          }
          const projectLabel = await geometry(page.getByTestId('project-label'));
          const projectAction = await geometry(page.getByTestId('project-action'));
          const projectWrapper = await geometry(page.getByTestId('project-action-wrapper'));
          // A deliberately plain span exposes the baseline contribution; product wrappers
          // must be checked on their actual page before changing their display mode.
          diagnostics.plainSpanProject = {
            action: projectAction,
            label: projectLabel,
            wrapper: projectWrapper,
            verticalOffset: projectAction.centerY - projectLabel.centerY,
            extraWrapperHeight: projectWrapper.height - projectAction.height,
          };

          const alignedLabel = await geometry(page.getByTestId('aligned-project-label'));
          const alignedAction = await geometry(page.getByTestId('aligned-project-action'));
          const alignedWrapper = await geometry(page.getByTestId('aligned-project-wrapper'));
          diagnostics.alignedProject = {
            action: alignedAction,
            label: alignedLabel,
            wrapper: alignedWrapper,
          };
          near(alignedWrapper.height, 24, 'inline-flex project wrapper height');
          near(
            alignedWrapper.height,
            alignedAction.height,
            'inline-flex wrapper adds no baseline height',
          );
          near(alignedAction.centerY, alignedLabel.centerY, 'project label/action vertical center');

          const resource = page.getByTestId('resource-action');
          const resourceBox = await geometry(resource);
          const resourceIcons = await Promise.all([
            geometry(resource.locator('svg').nth(0)),
            geometry(resource.locator('svg').nth(1)),
          ]);
          diagnostics.resource = { box: resourceBox, icons: resourceIcons };
          for (const [index, expected] of [18, 14].entries()) {
            near(resourceIcons[index].cssWidth, expected, 'resource SVG width');
            near(resourceIcons[index].cssHeight, expected, 'resource SVG height');
            near(resourceIcons[index].centerY, resourceBox.centerY, 'resource SVG vertical center');
          }

          const trigger = page.getByTestId('accordion-trigger');
          for (const expanded of [false, true]) {
            await expect(trigger).toHaveAttribute('aria-expanded', String(expanded));
            const arrow = trigger.locator('[data-slot="accordion-trigger-icon"]:visible');
            await expect(arrow).toHaveCount(1);
            const arrowBox = await geometry(arrow);
            const triggerBox = await geometry(trigger);
            const labelBox = await geometry(page.getByTestId('accordion-label'));
            const actionBox = await geometry(page.getByTestId('header-action'));
            const heading = trigger.locator('..');
            const headingMargin = await heading.evaluate((element) => {
              const style = getComputedStyle(element);
              return [style.marginTop, style.marginRight, style.marginBottom, style.marginLeft];
            });
            diagnostics[`accordion-${expanded}`] = {
              action: actionBox,
              arrow: arrowBox,
              headingMargin,
              label: labelBox,
              trigger: triggerBox,
            };
            expect
              .soft(headingMargin, 'accordion heading has no reset margins')
              .toEqual(['0px', '0px', '0px', '0px']);
            near(actionBox.height, 24, 'header action height');
            near(
              actionBox.centerY,
              labelBox.centerY,
              '24px accordion label/action vertical center',
            );
            near(arrowBox.width, 16, 'accordion arrow width');
            near(arrowBox.height, 16, 'accordion arrow height');
            near(arrowBox.centerY, triggerBox.centerY, 'accordion arrow/trigger vertical center');
            near(arrowBox.centerY, labelBox.centerY, 'accordion arrow/label vertical center');
            if (!expanded) await trigger.click();
          }
          await expect(page.getByText('Content remains reachable after expanding.')).toBeVisible();
          await testInfo.attach('expanded.png', {
            body: await page.screenshot({ animations: 'disabled', fullPage: true }),
            contentType: 'image/png',
          });

          await page.reload();
          await expect(page.getByTestId('action-small')).toBeVisible();
          await page.keyboard.press('Tab');
          await expect(page.getByTestId('action-small')).toBeFocused();
          await expect(page.getByTestId('action-small')).toHaveAccessibleName(
            `${text === 'zh' ? '项目与任务' : 'Projects and tasks'}: small`,
          );
          await expect(page.locator('[data-slot="tooltip-content"]')).toBeVisible();
          const focusRing = await page
            .getByTestId('action-small')
            .evaluate((element) => getComputedStyle(element).boxShadow);
          expect.soft(focusRing, 'keyboard focus has a visible ring').not.toBe('none');
          expect.soft(errors, 'fixture runtime errors').toEqual([]);
        } finally {
          await testInfo.attach('geometry.json', {
            body: JSON.stringify({ ...diagnostics, errors }, null, 2),
            contentType: 'application/json',
          });
          await testInfo.attach('fixture.png', {
            body: await page.screenshot({ animations: 'disabled', fullPage: true }),
            contentType: 'image/png',
          });
        }
      });
    }
  }
}
