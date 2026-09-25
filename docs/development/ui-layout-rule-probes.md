# UI 布局规则探针与 ARIA 清单

Linear 对齐以往靠人眼逐页找问题，只在某个状态出现的走样（例如任务运行中时，issue 详情属性栏的负责人行被居中）很容易漏掉。这组探针把「发现」变成可重复的检查：在真实浏览器里采几何数据，再用纯函数判定，E2E 在 CI 里对固定区域断言 0 违规。

代码位置：

| 文件                                                         | 作用                                                                                                     |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `e2e/src/probes/layoutRules.ts`                              | 页面内采集（`getBoundingClientRect` / `getComputedStyle` → 纯数据）+ 纯函数判定器 + `formatViolations()` |
| `e2e/src/probes/ariaInventory.ts`                            | `locator.ariaSnapshot()` → `{ role, name, depth }[]`，以及两份清单的 diff                                |
| `e2e/src/features/regression/task-properties-layout.feature` | 对 `[data-testid="task-properties"]` 的回归场景（运行中 / 未运行各一）                                   |

## 布局规则

每条违规形如 `{ rule, severity, selector, detail }`。

| 规则                   | 判定                                                                                                                                                                                                                                                               | 级别    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| `sibling-edge`         | 调用方给定容器内**纵向堆叠**的可见行，左缘 x 与宽度须与众数一致（容差 1px），报偏离者与差值。行共享同一行高度（换行的 pill 排）时不判定。行的「可见盒」会穿过单子节点的包装层（`display: contents`、块内联、与子节点等高的 trigger div），但不会钻进 inline 文字。 | error   |
| `centered-in-full-row` | 宽 ≥ 容器 95% 的行，首个可见内容（文字或 svg/img/canvas）左缘 > 行左缘 + 行宽 25% 即违规。                                                                                                                                                                         | error   |
| `clipped-text`         | `scrollWidth > clientWidth + 1` 且 `text-overflow` 不是 `ellipsis`。                                                                                                                                                                                               | error   |
| `type-scale`           | 统计可见文本 `(font-size, font-weight)` 直方图；给定允许集合（如 `['13px/500', '12px/400']`）时报集合外组合。                                                                                                                                                      | warning |
| `date-format`          | 可见文字含 ISO 日期 `\d{4}-\d{2}-\d{2}`（前后不紧挨数字，`2026-09-25T10:00Z` 也算）。                                                                                                                                                                              | error   |
| `hover-glyph`          | 交互规则，单独导出 `probeHoverGlyphs()`：hover 前给元素内每个 svg 打标记，hover 后可见 svg 数量减少即违规，并指出哪个 svg 被隐藏或卸载；图标互换不算。                                                                                                             | error   |

## 本地对任意页面运行

在任意 Playwright 脚本或 E2E step 里：

```ts
import { formatViolations, probeHoverGlyphs, runLayoutRules } from './probes/layoutRules';

await page.setViewportSize({ height: 900, width: 1440 });
await page.goto('http://localhost:3010/task/ORV-12');

const { sample, typeScale, violations } = await runLayoutRules(
  page,
  '[data-testid="task-properties"]',
  {
    allowedTypeScale: ['13px/500', '12px/400'], // 省略则 type-scale 只出直方图
    ignoreTextSelector: 'code, pre', // 文字规则跳过这些元素
  },
);
console.log(formatViolations(violations));
console.table(typeScale);
// 断言前先确认真的采到了东西
console.log(sample.rowScopes.map((scope) => scope.rows.length));

const hover = await probeHoverGlyphs(page, page.locator('[data-testid="task-properties"] > *'));
console.log(formatViolations(hover.violations));
```

`layoutSampleScript(scope)` 返回的是纯源码字符串，也可以直接喂给 CDP `Runtime.evaluate` 或浏览器控制台，拿到同样的 `LayoutSample` 后在 Node 侧调用 `evaluateLayoutRules()`。

## ARIA 清单对比

```ts
import { captureAriaInventory, diffAriaInventory, formatAriaDiff } from './probes/ariaInventory';

const reference = await captureAriaInventory(referencePage, 'aside');
const candidate = await captureAriaInventory(page, '[data-testid="task-properties"]');
const diff = diffAriaInventory(reference.inventory, candidate.inventory, {
  aliases: { 'add label': 'labels' },
  ignoreRoles: ['generic', 'text'],
});
console.log(formatAriaDiff(diff));
```

配对按 `role` + 规范化名称（小写、合并空白、可选别名表），按多重集计数；先配精确名，再让 `/pattern/` 形式的正则名匹配另一侧剩余条目。层级深度不参与配对。

**仓库里不得提交任何第三方产品（包括 Linear）的 ARIA 快照或截图**，对比只在本地进行。

## 已知误报来源

- `sibling-edge`：设计上本就更窄的行（如「+ 添加」这类幽灵按钮）会被报出；这类区域应缩小 scope 或不跑这条规则。
- `centered-in-full-row`：刻意居中的空状态行会被报出。
- `clipped-text`：`overflow: visible` 的溢出也会命中（文字没被裁，而是溢出盒外），同样是布局问题但措辞是「clipped」。
- `date-format`：需要原样展示的 ID、版本号、代码里的日期应通过 `ignoreTextSelector` 排除。
- `hover-glyph`：hover 时有意用文字替换图标的控件会被报出；`restPoint` 若落在另一个可交互元素上，before 状态可能已不是静止态。
