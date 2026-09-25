# 桌面主进程的启动顺序：pre-app-init

> 本文说明 `apps/desktop/src/main/pre-app-init.ts` 为什么必须先于主进程其余代码执行、打包产物如何保证这一点，以及改动它时不能破坏的约束。仓库级开发规范见 [`AGENTS.md`](../../AGENTS.md)。

## 它做什么

开发模式下，`pre-app-init` 调用 `app.setName('orvilo-desktop-dev')`，并把 `userData` 设为 `ORVILO_DESKTOP_USER_DATA_DIR`（未设置时为 `<appData>/orvilo-desktop-dev`）。池化开发实例（`.agents/acceptance/scripts/electron-dev.sh start <id>`）依赖它把每个实例隔离到 `/tmp/orvilo-electron-pool/ud-<id>`。

Electron 的约束：某个路径一旦被 `app.getPath()` 读过，之后的 `setPath` 静默无效。而 `@/const/dir` 在**模块顶层**读取 `userData`（`userDataDir` / `appStorageDir`，进而影响 `STORE_DEFAULTS.storagePath`），所以 `pre-app-init` 必须在它之前运行。

## 为什么源码里的 import 顺序不够

`src/main/index.ts` 第一行就是 `import './pre-app-init'`，但 Rolldown 输出 CJS 时会把 **chunk 的 `require()` 提升到入口内联语句之前**。旧产物是：

```js
const require_main_app = require('./main-app-<hash>.js'); // 这里已执行 const/dir
// …内联的 pre-app-init：setPath('userData', …) —— 已经太晚
```

结果：Chromium 数据（Storage、GPUCache…）进了实例目录，但 `orvilo-storage/`（含 `local-database.sqlite3`）仍落在默认的 `orvilo-desktop-dev` profile，所有池实例与 golden profile 共用一个 SQLite。

## 现在的保证

两条缺一不可（`apps/desktop/scripts/preAppInitChunk.mjs`）：

1. **独立 chunk**：`vite.main.config.ts` 的 `manualChunks` 把 `pre-app-init.ts` 单独输出为 `pre-app-init` chunk，入口先 `require` 它，再 `require` `main-app`。
2. **自包含**：`pre-app-init.ts` 只能 import Node 内置模块（用具名导入，避免引入 Rolldown 的 interop runtime）和 `electron`。一旦 import 任何与 `main-app` 共享的一方模块（哪怕是 `@/utils/platform`），这个 chunk 自己就会先 `require` `main-app`，问题复现。因此它内联了一份与 `@/utils/platform` 的 `dev()` 等价的判断。

`preAppInitOrderGuard()` 在 `generateBundle` 阶段检查这两条，违反时**构建失败**。回归测试见 `apps/desktop/scripts/__tests__/preAppInitChunk.test.mjs`。

## 备选方案（未采用）

- `output.strictExecutionOrder: true`：也能修复，但会把主进程所有模块包进惰性初始化函数，属于全局行为变化。
- 让 `@/const/dir` 惰性求值：会波及 `STORE_DEFAULTS` 及其使用方。

新增 `userData` 相关代码时，优先在函数内调用 `app.getPath('userData')`，不要在模块顶层捕获。
