# Test CI：一次看全所有失败

2026/10/09

## 行为

Test CI 的每个任务失败时会取消整轮运行。一个分支有多处互不相关的失败时，每次推送只能看到最先失败的那一处。

推送的最新提交信息里带 `[ci full]` 时，这一轮不取消：

- 十处 “Fail fast — cancel sibling jobs” 步骤跳过；
- 应用测试和服务端测试两个分片矩阵的 `fail-fast` 关闭。

不带标记时行为不变。汇总门禁 “Required Quality Gate” 不变，任何一项失败仍然是红。

## 用法

```bash
git commit -m "🐛 fix: ... [ci full]"
```

标记只对带它的那一次推送生效。

## 实现

`.github/workflows/test.yml`：

- 工作流级 `env.CI_RUN_ALL`，由 `github.event.head_commit.message` 计算。推送触发的运行是结论的所有者，PR 触发的运行只照抄它的结论，所以只读推送事件。
- `strategy` 里不能用 `env`，两个矩阵直接写同一个表达式。

## 由来

集成分支 #630 上有五处互不相关的失败，按默认行为需要五轮推送才能逐个看到。打开开关后一轮列全。
