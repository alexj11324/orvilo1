# 桌面渲染器的开发期 HTML 路由

> 本文说明 `apps/desktop/vite.renderer.config.ts` 为什么需要一条路由中间件、它把哪些请求
> 映射到哪份 HTML，以及静态加载屏与 white-label 注入之间的契约。
> 仓库级开发规范见 [`AGENTS.md`](../../AGENTS.md)。

## 为什么需要这一层

桌面 renderer 的 Vite dev server 以 **monorepo 根目录**为 `root`（桌面构建要能直接引用
根下的 SPA 源码）。代价是 Vite 默认的 `appType: 'spa'` 回退会把**未匹配的路径**交给根
`index.html` —— 那是 **web 入口**，会加载 `src/spa/entry.web.tsx`。

而 Electron 的 BrowserWindow 加载的是 `app://renderer/<route>` 这类 deep link
（例如 `app://renderer/desktop-onboarding?screen=welcome`）。它一旦没被显式重写，
窗口就会启动**另一个 SPA**：桌面壳渲染成 web 版，还会闪出只属于 web 入口的品牌图形。

## 映射表

| 请求 | 目标 HTML | 看请求头吗 |
| --- | --- | --- |
| `/`、`/index.html` | `apps/desktop/index.html` | 否 —— 显式入口，无条件重写 |
| `/overlay`、`/overlay.html` | `apps/desktop/overlay.html` | 否 |
| `/popup.html`、`/popup`、`/popup/**` | `apps/desktop/popup.html` | 否（沿用历史行为） |
| 其它 deep link | `apps/desktop/index.html` | **是**，且仅限文档导航 |

## 「这是路由还是文件」怎么判

兜底只对**文档导航**生效（`Sec-Fetch-Dest: document`，或 `Accept` 含 `text/html`）：
把子资源请求答成 HTML 会把模块换成页面。

在文档导航内部还要再分一次：

- **根级文件名**是文件 —— `/favicon.ico`、`/not-compatible.html`、`/sitemap.xml.gz`；
- **「末段含点」不是判据** —— `/community/skill/github.owner.repo` 是 updater 明确要
  保留的路由 slug，见 `apps/desktop/src/main/modules/updater/utils.ts` 的
  `ROOT_STATIC_FILE_RE` 及其测试。用含点判定会把这类路由交回 SPA 回退，也就是本文
  开头那个 bug。

> `/popup/**` 那个分支沿用的是仓库历史上的宽判定（末段含点即文件），与本兜底不同。
> 已知它拦不住 `/popup/@vite/client`（末段是 `client`，无点、也不以 `/@` 开头）。

## 静态加载屏与 white-label 注入

入口 HTML 里只放一个**空 marker**：

```html
<div id="loading-screen"></div>
```

它自身不画任何东西。需要品牌名时由 `customBrandingLoadingScreen` 注入 —— 该插件只在
根 `vite.config.ts`（web 工程）注册，且在 `BRANDING_NAME === 'LobeHub'`（上游默认）时
不做任何事。

这条契约由 `plugins/vite/customBrandingLoadingScreen.test.ts` 对**真实的
`index.html`** 断言，所以 marker 被改形状时测试会红，而不是静默失效。

> 历史注记：根 `index.html` 曾长期带着上游 LobeHub 的字标（`<svg><path>` 加
> `loading-draw` / `loading-fill` 动画）。PR #13 只清了 `apps/desktop/*.html`，
> PR #36 只改了它的字符串，图形一直留到 2026-09-18 才移除。

## 相关文件

- `plugins/vite/electronDesktopHtml.ts` —— 路由判定，纯函数 `resolveDesktopHtml`
  及其测试
- `plugins/vite/customBrandingLoadingScreen.ts` —— white-label 品牌名注入
- `plugins/vite/devLoadingProgress.ts` —— dev 期底部进度行；只在 boot 占位元素
  还在 DOM 里时显示
