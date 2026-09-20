/**
 * Agent Scroll Steps
 *
 * Step definitions for @AGENT-SCROLL-* scenarios. These verify that the
 * `useConversationScroll` hook + `<AutoScroll />` component cooperate
 * correctly under the three real-world cases:
 *
 * 1. `enableAutoScrollOnStreaming = true`   → viewport stays near bottom
 * 2. `enableAutoScrollOnStreaming = false`  → user message pinned to top
 * 3. User scrolls up mid-stream              → viewport stays put
 */
import { After, Given, Then, When } from '@cucumber/cucumber';
import { expect } from '@playwright/test';

import { llmMockManager, presetResponses } from '../../mocks/llm';
import {
  classifyScrollTrace,
  type ScrollCallRecord,
  type ScrollTraceSummary,
  startScrollTrace,
  stopScrollTrace,
} from '../../probes/scrollTrace';
import { TEST_USER } from '../../support/seedTestUser';
import type { CustomWorld } from '../../support/world';

// How close to the scroll container's bottom is considered "at bottom".
// Matches (with slack) the product's own AT_BOTTOM_THRESHOLD (300 px).
const AT_BOTTOM_EPSILON = 320;
// Distance the user manually scrolls up for scenario 3.
const MANUAL_SCROLL_UP_DELTA = 200;

interface ScrollSnapshot {
  bottomCompensationHeight: number;
  clientHeight: number;
  debugFlag: string | null;
  distanceToBottom: number;
  scrollHeight: number;
  scrollTop: number;
}

// ---------------------------------------------------------------------------
// DOM helpers (executed inside the page)
// ---------------------------------------------------------------------------

// The chat list's scroll viewport is virtua's own root element and carries no
// test id, so every helper below resolves it the way the DOM exposes it: the
// nearest scrollable ancestor of a mounted message.
async function getScrollSnapshot(world: CustomWorld): Promise<ScrollSnapshot | null> {
  const anyMessage = world.page.locator('.message-wrapper').first();
  if ((await anyMessage.count()) === 0) return null;

  return anyMessage.evaluate((node) => {
    let el: HTMLElement | null = node.parentElement;
    while (el) {
      const { overflowY } = window.getComputedStyle(el);
      if (overflowY === 'auto' || overflowY === 'scroll') break;
      el = el.parentElement;
    }
    if (!el) return null;

    const bottomCompensationHeight = Math.max(
      0,
      ...Array.from(el.querySelectorAll<HTMLElement>('div[aria-hidden="true"]'))
        .filter((candidate) => {
          const nodeStyle = window.getComputedStyle(candidate);
          return nodeStyle.pointerEvents === 'none' && candidate.offsetWidth > 0;
        })
        .map((candidate) => candidate.getBoundingClientRect().height),
    );

    return {
      bottomCompensationHeight,
      clientHeight: el.clientHeight,
      debugFlag: window.localStorage.getItem('debug'),
      distanceToBottom: el.scrollHeight - el.scrollTop - el.clientHeight,
      scrollHeight: el.scrollHeight,
      scrollTop: el.scrollTop,
    };
  });
}

// The scroll hook records its verdicts into a window ring buffer — read it
// directly so a failure dump shows the hook's own view (console forwarding
// races on CI workers and silently drops lines).
async function getScrollDiag(world: CustomWorld): Promise<string[]> {
  return world.page
    .evaluate(() => (globalThis as { __orviloScrollDiag?: string[] }).__orviloScrollDiag ?? [])
    .catch(() => []);
}

// Reads the exposed chat store snapshot (exposed because the scroll @Before
// sets localStorage.debug — see src/store/middleware/expose.ts) so a failure
// dump can tell a held queued send from a dispatched-but-starved one.
async function getChatQueueSnapshot(world: CustomWorld): Promise<unknown> {
  return world.page
    .evaluate(() => {
      const stores = (globalThis as { __ORVILO_STORES?: Record<string, () => unknown> })
        .__ORVILO_STORES;
      const state = stores?.chat?.() as
        | {
            queuedMessages?: Record<string, unknown[]>;
            operationsByContext?: Record<string, string[]>;
            operations?: Record<string, { status?: string; type?: string }>;
            creatingTopicIds?: string[];
          }
        | undefined;
      if (!state) return null;
      return {
        creatingTopicIds: state.creatingTopicIds,
        operations: Object.fromEntries(
          Object.entries(state.operations ?? {}).map(([id, op]) => [
            id,
            { status: op.status, type: op.type },
          ]),
        ),
        operationsByContext: Object.fromEntries(
          Object.entries(state.operationsByContext ?? {}).map(([key, ids]) => [key, ids.length]),
        ),
        queuedMessages: Object.fromEntries(
          Object.entries(state.queuedMessages ?? {}).map(([key, msgs]) => [key, msgs.length]),
        ),
      };
    })
    .catch(() => null);
}

async function dumpScrollDiagnostics(world: CustomWorld): Promise<void> {
  console.log(`   📍 pin failure dump: ${JSON.stringify(await getScrollSnapshot(world))}`);
  const scrollDiag = await getScrollDiag(world);
  if (scrollDiag.length > 0)
    console.log(`   📍 scroll hook diag: ${JSON.stringify(scrollDiag.slice(-40))}`);
  const queue = await getChatQueueSnapshot(world);
  if (queue) console.log(`   📍 chat queue: ${JSON.stringify(queue)}`);
}

async function getScrollPgClient(world: CustomWorld) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return undefined;

  let client = world.testContext.scrollPgClient;
  if (!client) {
    const { default: pg } = await import('pg');
    client = new pg.Client({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 10_000,
      query_timeout: 10_000,
    });
    try {
      await client.connect();
    } catch {
      return undefined;
    }
    world.testContext.scrollPgClient = client;
  }
  return client;
}

async function dropScrollPgClient(world: CustomWorld, client: { end: () => Promise<void> }) {
  world.testContext.scrollPgClient = undefined;
  await client.end().catch(() => {});
}

async function fetchLatestUserMessageId(
  world: CustomWorld,
  prompt: string,
  sentAt: number,
): Promise<string | undefined> {
  const client = await getScrollPgClient(world);
  if (!client) return undefined;
  try {
    const res = await client.query(
      `select id from messages
       where role = 'user' and content = $1
         and created_at >= to_timestamp($2 / 1000.0) - interval '15 seconds'
       order by created_at desc limit 1`,
      [prompt, sentAt],
    );
    return res.rows[0]?.id;
  } catch {
    await dropScrollPgClient(world, client);
    return undefined;
  }
}

async function sendPrompt(world: CustomWorld, prompt: string, response: string): Promise<void> {
  llmMockManager.setResponse(prompt, response);

  const input = world.page
    .locator(
      '[data-testid="chat-input"] [contenteditable="true"], [data-testid="chat-input"] textarea',
    )
    .filter({ visible: true })
    .first();
  await expect(input, `chat input is not available before sending: ${prompt}`).toBeVisible();
  await expect(input, `chat input is not editable before sending: ${prompt}`).toBeEditable();
  // Click to focus rather than relying on ambient focus (the previous send may
  // have left it anywhere), then type for real: `fill()` writes straight to the
  // DOM, which the Lexical editor does not pick up as editor state, so Enter
  // would submit an empty message.
  await input.click();
  await world.page.keyboard.type(prompt, { delay: 20 });
  await expect(input, `chat input did not receive prompt text: ${prompt}`).toContainText(prompt);
  const sentAt = Date.now();
  await world.page.keyboard.press('Enter');

  // The DOM re-key waits for the whole `sendMessageInServer` mutation to
  // resolve — including the getMessagesAndTopics tail over a multi-thousand-
  // line conversation, which can sit behind a multi-minute CI Postgres
  // checkpoint. The user row itself commits in the mutation's first write and
  // the real id is client-minted + server-honoured, so read it directly.
  const pollPersisted = () =>
    expect
      .poll(async () => (messageId = await fetchLatestUserMessageId(world, prompt, sentAt)), {
        message: `user message was not persisted after sending prompt: ${prompt}`,
        // A CI Postgres checkpoint has been observed stalling writes for ~270s;
        // 90s windows exhaust inside one and read a slow commit as a lost send.
        timeout: 150_000,
      })
      .toBeTruthy();

  let messageId: string | undefined;
  try {
    await pollPersisted();
  } catch {
    // Two distinct misses land here: Enter swallowed by a composer re-render
    // (row never INSERTed — pressing again on the still-typed input resends),
    // or a dispatched send whose INSERT is starved mid-checkpoint (input is
    // already clear — Enter on an empty composer is a no-op, so the re-press
    // is safe and the second poll window still catches the row).
    console.log('   📍 persist poll exhausted; pressing Enter once more');
    const queue = await getChatQueueSnapshot(world);
    if (queue) console.log(`   📍 chat queue: ${JSON.stringify(queue)}`);
    await input.press('Enter');
    await pollPersisted();
  }

  world.testContext.lastSentUserMessageId = messageId;
  world.testContext.lastSentUserPrompt = prompt;
}

/**
 * True while the topic the last send belongs to still has a `running`
 * agent_operation. Runs via the fake device clear through `heteroFinish` →
 * settleRunningOperation; a send fired while an op is still `running` gets
 * held client-side until the run ends, so waiting for idle here keeps
 * back-to-back sends off that queue. Scoped per topic because crashed runs
 * leave stale `running` rows on unrelated topics. When DATABASE_URL is absent
 * the gate degrades to "idle" so it never blocks.
 */
type RunState = 'done' | 'pending' | 'running';

async function runState(world: CustomWorld): Promise<RunState> {
  const lastSent = world.testContext.lastSentUserMessageId;
  if (!lastSent) return 'pending';

  // One client per world: opening a fresh connection per 250ms poll is itself
  // a load spike on CI's shared Postgres (a checkpoint there took ~270s), and
  // a transient connect/query failure must NOT read as "idle" — that both
  // releases sends into the client-side queue while the run is still live and
  // hides the `running` observation the settle loop requires. On error, reuse
  // the last reading; only a fresh successful query changes the answer.
  const client = await getScrollPgClient(world);
  if (!client) return 'pending';
  try {
    // The op row for this send is created at dispatch — right after
    // `sendMessageInServer` re-keys the tmp_ id — so it can be created, run to
    // completion, and flip `done` entirely between the re-key and this poll's
    // first tick. "Latest op on the topic is terminal AND started after this
    // message was written" therefore means THIS send's run already finished —
    // don't require having caught the running window. An older (stale) op's
    // started_at precedes the message and reads as 'pending' instead.
    const res = await client.query(
      `select o.status,
              o.started_at is not null
                and o.started_at >= (select created_at - interval '10 seconds'
                                     from messages where id = $1) as fresh
       from agent_operations o
       where o.topic_id = (select topic_id from messages where id = $1)
       order by o.started_at desc nulls last
       limit 1`,
      [lastSent],
    );
    const row = res.rows[0];
    let state: RunState;
    if (!row) state = 'pending';
    else if (row.status === 'running') state = 'running';
    else state = row.fresh ? 'done' : 'pending';
    world.testContext.scrollLastRunState = state;
    return state;
  } catch {
    // A dead connection must not pin the reading forever: drop the client so
    // the next poll reconnects, but report the last reading this once — a
    // transient blip shouldn't read as a spurious 'idle'.
    await dropScrollPgClient(world, client);
    return world.testContext.scrollLastRunState ?? 'pending';
  }
}

async function waitForAssistantMessageToSettle(
  world: CustomWorld,
  minLength: number,
): Promise<void> {
  const assistantMessage = world.page
    .locator('.message-wrapper')
    .filter({ has: world.page.locator('text=Orvilo AI') })
    .last();

  await expect(assistantMessage).toBeVisible({ timeout: 15_000 });

  // Settle on the run lifecycle, not text stability: streaming renders ticking
  // indicators inside the wrapper so innerText may never sit still. Require a
  // terminal op row for THIS send before trusting "idle", otherwise a stale
  // long reply from the previous turn would release the next send into the
  // client-side queue. 'done' covers both orderings: the poll observed the run
  // while it streamed, or the whole run finished before the first poll tick
  // (dispatch+stream+finish can outrun the re-key observation).
  const deadline = Date.now() + 150_000;
  let lastLength = 0;
  while (Date.now() < deadline) {
    const length = await assistantMessage
      .innerText()
      .then((text) => text.length)
      .catch(() => 0);
    lastLength = length;

    const state = await runState(world);
    if (state === 'done' && length > minLength) {
      // Run is over — give the UI one beat to apply the final pushed events.
      await world.page.waitForTimeout(400);
      return;
    }

    await world.page.waitForTimeout(250);
  }

  throw new Error(`assistant response did not settle in time (last length: ${lastLength})`);
}

async function scrollBy(world: CustomWorld, deltaY: number): Promise<void> {
  await world.page
    .locator('.message-wrapper')
    .first()
    .evaluate((node, dy) => {
      let el: HTMLElement | null = node.parentElement;
      while (el) {
        const { overflowY } = window.getComputedStyle(el);
        if (overflowY === 'auto' || overflowY === 'scroll') {
          el.scrollTop = Math.max(0, el.scrollTop + dy);
          el.dispatchEvent(new Event('scroll', { bubbles: true }));
          return;
        }
        el = el.parentElement;
      }
    }, deltaY);
}

// ---------------------------------------------------------------------------
// Setting toggle via the appearance settings page (the standalone
// chat-appearance tab was folded into Appearance in the v6 IA rework)
// ---------------------------------------------------------------------------

async function setAutoScrollEnabled(world: CustomWorld, desired: boolean): Promise<void> {
  await world.page.goto('/settings/appearance');
  // The first local dev compile can take a while, so keep an explicit timeout.
  // (Next.js builds the settings route on demand); a generous timeout avoids
  // flakes when the test suite warms up a cold server.
  await world.page.waitForLoadState('domcontentloaded', { timeout: 60_000 });

  // Match both EN ("Auto-scroll During AI Response") and zh-CN ("AI 回复时自动滚动").
  const title = world.page.getByText(/Auto-scroll During AI Response|AI 回复时自动滚动/);
  await expect(title).toBeVisible({ timeout: 45_000 });

  // The switch lives inside the same FormGroup as the title.
  const switcher = world.page
    .locator('[role="switch"], button.ant-switch')
    .filter({
      has: title,
    })
    .or(
      world.page
        .locator('div')
        .filter({ has: title })
        .last()
        .locator('[role="switch"], button.ant-switch')
        .first(),
    );

  // Fall back: the switch is the nearest role=switch sibling of the title node.
  const nearestSwitch = world.page.locator('[role="switch"]').first();
  const target = (await switcher.count()) > 0 ? switcher.first() : nearestSwitch;

  const currentChecked = (await target.getAttribute('aria-checked')) === 'true';
  if (currentChecked !== desired) {
    await target.click();
    await expect(target).toHaveAttribute('aria-checked', String(desired));

    // Navigating while the async settings request is still in flight can
    // abort it and make the next page reload the previous value. Wait for the
    // UI's save-state contract instead of relying on a fixed delay.
    await expect(world.page.getByText(/Saved|\u5DF2\u4FDD\u5B58/).last()).toBeVisible({
      timeout: 15_000,
    });
  }
}

// ---------------------------------------------------------------------------
// Given steps
// ---------------------------------------------------------------------------

Given(
  '用户在设置中开启 {string}',
  { timeout: 90_000 },
  async function (this: CustomWorld, _label: string) {
    await setAutoScrollEnabled(this, true);
  },
);

Given(
  '用户在设置中关闭 {string}',
  { timeout: 90_000 },
  async function (this: CustomWorld, _label: string) {
    await setAutoScrollEnabled(this, false);
  },
);

Given('流式响应被放慢以模拟长文输出', async function (this: CustomWorld) {
  // The pin is only observable while the reply is short enough that the spacer
  // still holds the user message at the top; once the reply outgrows the
  // viewport the spacer collapses and auto-scroll (on by default) takes over.
  // So the stable window to assert against is the *head delay*, where the
  // assistant placeholder is mounted but no tokens have streamed yet. Make that
  // window generous and keep the stream itself brisk — a slow per-chunk stream
  // would push a full turn past `等待流式响应结束`'s timeout on a loaded CI box.
  // Scoped to the long-article prompts via a fragment — the shared global
  // config would race with sibling workers' setConfig/resetConfig calls and
  // could collapse this window (or slow unrelated sends) mid-flight.
  llmMockManager.setTimingForFragment('很长的文章', {
    responseDelay: 4000,
    streamChunkSize: 40,
    streamDelay: 25,
  });
  this.testContext.scrollMockAdjusted = true;
});

// ---------------------------------------------------------------------------
// When steps
// ---------------------------------------------------------------------------

When('用户发送长文消息并等待回复完成', { timeout: 360_000 }, async function (this: CustomWorld) {
  const prompt = '请输出一篇很长的文章';
  await sendPrompt(this, prompt, presetResponses.longScrollArticle);

  // Wait for assistant message to appear and its content to stabilize.
  const messageWrappers = this.page.locator('.message-wrapper');
  await expect(messageWrappers)
    .toHaveCount(2, { timeout: 15_000 })
    .catch(() => {});

  const assistantMessage = this.page
    .locator('.message-wrapper')
    .filter({ has: this.page.locator('text=Orvilo AI') })
    .last();
  await expect(assistantMessage).toBeVisible({ timeout: 15_000 });

  // Poll until text has grown past an obvious threshold, then plateaus.
  await waitForAssistantMessageToSettle(this, 200);
});

When('用户发送一条触发长文输出的消息', { timeout: 240_000 }, async function (this: CustomWorld) {
  const prompt = '请输出一篇很长的文章';
  await sendPrompt(this, prompt, presetResponses.longScrollArticle);

  // Wait long enough for pin's smooth scrollToIndex to finish. Virtua drives
  // the smooth animation via rAF and would otherwise overwrite a manual
  // scroll while the animation is still in flight.
  await this.page.waitForTimeout(1200);
});

When(
  '用户完成一轮用于垫高列表的长回复对话',
  { timeout: 360_000 },
  async function (this: CustomWorld) {
    const prompt = '请先输出一篇很长的文章用于垫高列表';
    await sendPrompt(this, prompt, presetResponses.longScrollArticle);
    await waitForAssistantMessageToSettle(this, 200);
  },
);

When(
  '用户发送一条触发短回复的消息并等待回复完成',
  { timeout: 300_000 },
  async function (this: CustomWorld) {
    const prompt = '请输出一段短回复用于测试底部补偿区域';
    await sendPrompt(this, prompt, '这是一个短回复，用于让底部补偿区域保持可见。');
    await waitForAssistantMessageToSettle(this, 10);
    await this.page.waitForTimeout(400);
  },
);

When('记录聊天列表底部补偿区域高度', async function (this: CustomWorld) {
  const snap = await getScrollSnapshot(this);
  expect(snap, 'failed to locate scroll container').not.toBeNull();
  expect(snap!.bottomCompensationHeight).toBeGreaterThan(0);
  expect(snap!.scrollTop).toBeGreaterThan(120);

  this.testContext.scrollCompensationHeight = snap!.bottomCompensationHeight;
  this.testContext.scrollHeightBeforeSyntheticOffset = snap!.scrollHeight;
});

When('模拟非用户触发的聊天列表上移 {int} 像素', async function (this: CustomWorld, px: number) {
  await scrollBy(this, -Math.abs(px));
  await this.page.waitForTimeout(400);
});

When('用户在流式响应进行中向上滚动 {int} 像素', async function (this: CustomWorld, px: number) {
  const delta = Math.abs(px) || MANUAL_SCROLL_UP_DELTA;
  // Mouse wheel over the list, more faithful to real-user interaction than
  // setting `scrollTop` directly. Move the cursor into the list viewport
  // first — wheel events fire against whatever element is under the cursor.
  await this.page.mouse.move(640, 400);
  await this.page.mouse.wheel(0, -delta);
  await scrollBy(this, -delta);
  // Let the onScroll handler run (pin cancel + spacer shrink).
  await this.page.waitForTimeout(400);
});

When('开始记录聊天列表滚动轨迹', async function (this: CustomWorld) {
  await startScrollTrace(this.page);
});

When('等待流式响应结束', { timeout: 200_000 }, async function (this: CustomWorld) {
  await waitForAssistantMessageToSettle(this, 200);
});

// ---------------------------------------------------------------------------
// Then steps
// ---------------------------------------------------------------------------

Then('视口应贴近聊天列表底部', { timeout: 60_000 }, async function (this: CustomWorld) {
  const snap = await getScrollSnapshot(this);
  expect(snap, 'failed to locate scroll container').not.toBeNull();
  expect(snap!.distanceToBottom).toBeLessThanOrEqual(AT_BOTTOM_EPSILON);
});

Then('视口不应贴近聊天列表底部', { timeout: 90_000 }, async function (this: CustomWorld) {
  // The pin keeps the user's message at the container top with a bottom
  // compensation spacer, so scrollTop legitimately equals the maximum when
  // pinned — distanceToBottom can never distinguish "pinned" from
  // "followed to the bottom". Check the real contract instead: the latest
  // assistant reply extends below the visible fold (it would be fully in
  // view if the viewport had followed the stream to the bottom).
  const overflow = async () =>
    this.page.evaluate(() => {
      const messages = document.querySelectorAll('.message-wrapper');
      // NodeList has no .at() in the page context — use .item().
      const last = messages.item(messages.length - 1);
      if (!last) return null;
      let el = last.parentElement;
      while (el) {
        const { overflowY } = window.getComputedStyle(el);
        if (overflowY === 'auto' || overflowY === 'scroll') break;
        el = el.parentElement;
      }
      if (!el) return null;
      return last.getBoundingClientRect().bottom - el.getBoundingClientRect().bottom;
    });
  const dump = await this.page.evaluate(() => {
    const messages = [...document.querySelectorAll('.message-wrapper')];
    const last = messages.at(-1);
    const info = last
      ? {
          lastText: last.textContent?.slice(0, 60),
          chain: (() => {
            const out: string[] = [];
            let el: Element | null = last;
            while (el && out.length < 8) {
              const { overflowY } = window.getComputedStyle(el);
              out.push(
                `${el.tagName}.${(el.className || '').toString().slice(0, 40)}[${overflowY} h=${el.scrollHeight}/${el.clientHeight} st=${el.scrollTop}]`,
              );
              el = el.parentElement;
            }
            return out;
          })(),
        }
      : { count: messages.length };
    return info;
  });
  console.log(`   📍 scroll dump: ${JSON.stringify(dump)}`);
  try {
    await expect.poll(overflow, { timeout: 10_000 }).toBeGreaterThan(AT_BOTTOM_EPSILON);
  } catch (error) {
    // When the reply is an error bubble instead of the mock article the fold
    // math can never pass — surface the real failure: pull the last assistant
    // message's error payload from the DB so the log names the abort stage.
    const databaseUrl = process.env.DATABASE_URL;
    if (databaseUrl) {
      try {
        const { default: pg } = await import('pg');
        const client = new pg.Client({ connectionString: databaseUrl });
        await client.connect();
        try {
          const { rows } = await client.query(
            `select role, error, left(content, 80) as head
             from messages
             where user_id = $1
             order by created_at desc
             limit 3`,
            [TEST_USER.id],
          );
          console.log(`   📍 last messages: ${JSON.stringify(rows)}`);
        } finally {
          await client.end();
        }
      } catch (dbError) {
        console.log(`   📍 message error dump failed: ${String(dbError)}`);
      }
    }
    throw error;
  }
});

// Reset LLM mock timing overrides so the slowdown from scenario 3 does not
// leak into later unrelated scenarios.
After({ tags: '@scroll' }, async function (this: CustomWorld) {
  if (this.testContext.scrollMockAdjusted) {
    llmMockManager.resetConfig();
    this.testContext.scrollMockAdjusted = false;
  }
  const client = this.testContext.scrollPgClient;
  if (client) {
    this.testContext.scrollPgClient = undefined;
    this.testContext.scrollLastRunState = undefined;
    await client.end().catch(() => {});
  }
});

Then('用户消息不应固定在聊天列表顶部', { timeout: 60_000 }, async function (this: CustomWorld) {
  const rect = await measurePinDelta(this);

  expect(rect).not.toBeNull();
  // Pin is cancelled: the user message should have been pushed down by the
  // manual scroll. Anything beyond the "pinned" slack (150 px) means the
  // anchor was released.
  expect(Math.abs(rect!.delta)).toBeGreaterThan(150);
});

async function measurePinDelta(world: CustomWorld) {
  // Anchor by the prompt text, not data-message-id: the optimistic wrapper
  // renders under `tmp_` until the send mutation resolves and re-keys it — the
  // pin position is a layout fact that must not wait on that bookkeeping.
  const prompt = world.testContext.lastSentUserPrompt as string | undefined;
  expect(prompt, 'missing the latest sent user prompt').toBeDefined();

  const userMessage = world.page.locator('.message-wrapper').filter({ hasText: prompt! }).last();
  // Must not throw: callers wrap this in expect.poll, and a thrown assertion
  // aborts the poll outright. The wrapper can be briefly absent while the list
  // re-renders/virtualizes around the pin — null keeps the poll retrying.
  if (!(await userMessage.isVisible().catch(() => false))) return null;

  return userMessage.evaluate((message) => {
    let el: HTMLElement | null = message.parentElement;
    while (el) {
      const { overflowY } = window.getComputedStyle(el);
      if (overflowY === 'auto' || overflowY === 'scroll') break;
      el = el.parentElement;
    }
    if (!el) return null;

    const wrapperRect = message.getBoundingClientRect();
    const parentRect = el.getBoundingClientRect();
    return {
      delta: wrapperRect.top - parentRect.top,
      parentTop: parentRect.top,
      userTop: wrapperRect.top,
    };
  });
}

Then('用户消息应固定在聊天列表顶部', { timeout: 90_000 }, async function (this: CustomWorld) {
  // The pin uses a smooth (`align:'start', smooth:true`) scroll that re-fires on
  // every layout bump while the reply streams — so the anchored position is
  // reached *repeatedly*, not at one fixed instant. Sampling once after a fixed
  // wait races that animation and flakes (a mid-animation frame reads ~260px).
  // Poll for a settled frame within the slack instead. If the pin genuinely
  // never lands, the loop exhausts and the final assertion still fails with the
  // real delta — so a true regression is not masked.
  const PIN_SLACK = 150;
  try {
    await expect
      .poll(
        async () => {
          const rect = await measurePinDelta(this);
          return rect ? Math.abs(rect.delta) : null;
        },
        {
          message: 'latest user message did not reach the pinned position',
          // The poll must outlast the DOM re-key (tmp_ → persisted id) which
          // waits on the send mutation's getMessagesAndTopics tail — under CI
          // load that tail can trail the user-row insert by tens of seconds.
          timeout: 60_000,
        },
      )
      .toBeLessThanOrEqual(PIN_SLACK);
  } catch (error) {
    await dumpScrollDiagnostics(this);
    throw error;
  }
});

Then(
  '聊天列表应以多帧平滑滚动把用户消息顶到顶部',
  { timeout: 90_000 },
  async function (this: CustomWorld) {
    const PIN_SLACK = 150;
    // Keep the trace running through the pin poll: under a starved renderer
    // the optimistic commit can land *after* sendPrompt's pg persist check
    // returns, so the pin scroll may fire inside this window. Stopping early
    // reads a legitimate pin as calls=[] / travel=0.
    let calls: ScrollCallRecord[];
    let summary: ScrollTraceSummary;
    try {
      await expect
        .poll(
          async () => {
            const rect = await measurePinDelta(this);
            return rect ? Math.abs(rect.delta) : null;
          },
          { message: 'latest user message did not reach the pinned position', timeout: 60_000 },
        )
        .toBeLessThanOrEqual(PIN_SLACK);
      const result = await stopScrollTrace(this.page);
      calls = result.calls;
      summary = classifyScrollTrace(result.samples);
    } catch (error) {
      const result = await stopScrollTrace(this.page);
      console.log(
        `   📍 trace ${JSON.stringify(classifyScrollTrace(result.samples))} calls=${JSON.stringify(result.calls)}`,
      );
      await dumpScrollDiagnostics(this);
      throw error;
    }
    console.log(`   📍 trace ${JSON.stringify(summary)} calls=${JSON.stringify(calls)}`);

    // virtua's scrollToIndex never emits Element.scrollTo — it drives scrollTop
    // directly (rAF-smoothed while inside the 800ms send window, instant after
    // it — under a starved renderer the optimistic commit can land after the
    // window expires, and the instant jump is then the CORRECT behavior). So
    // calls=[] carries no signal; the contract under test is that the list
    // actually traveled when the pin fired.
    expect(summary.travel, `scroll trace: ${JSON.stringify(summary)}`).toBeGreaterThan(0);
  },
);

Then('聊天列表底部补偿区域高度不应收缩', { timeout: 60_000 }, async function (this: CustomWorld) {
  const before = this.testContext.scrollCompensationHeight as number | undefined;
  expect(before, 'missing recorded bottom compensation height').toBeDefined();

  const snap = await getScrollSnapshot(this);
  expect(snap, 'failed to locate scroll container').not.toBeNull();

  expect(snap!.bottomCompensationHeight).toBeGreaterThanOrEqual(before! - 2);
});
