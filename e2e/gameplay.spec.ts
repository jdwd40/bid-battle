import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';

/** isEnabled() waits for a detached element to reappear, so bound it: a vanished button is simply "not enabled". */
async function enabled(loc: Locator): Promise<boolean> {
  return loc.isEnabled({ timeout: 300 }).catch(() => false);
}

/** Click if still possible; the table moves on quickly, so a vanished button is not an error. */
async function tryClick(loc: Locator): Promise<boolean> {
  try {
    await loc.click({ timeout: 1500 });
    return true;
  } catch {
    return false;
  }
}

/**
 * One tick of "play sensibly": answer counter-offers, confirm a quote when asked,
 * buy the best ask once if allowed (when `wantsTrade`), otherwise pass. Never readies up.
 * Returns what the page did so the driver can stop when the goal is reached.
 */
async function act(page: Page, wantsTrade: boolean): Promise<'traded' | 'acted' | 'idle'> {
  if (await page.getByTestId('decline-counter').isVisible().catch(() => false)) {
    await tryClick(page.getByTestId('decline-counter'));
    return 'acted';
  }
  const confirm = page.getByTestId('confirm-quote');
  if ((await confirm.isVisible().catch(() => false)) && (await enabled(confirm))) {
    await tryClick(confirm);
    return 'acted';
  }
  const pass = page.getByTestId('pass');
  if ((await pass.isVisible().catch(() => false)) && (await enabled(pass))) {
    const buy = page.getByTestId('buy');
    if (wantsTrade && (await enabled(buy)) && (await tryClick(buy))) {
      const confirm = page.getByTestId('confirm-trade');
      await expect(confirm).toBeVisible();
      await expect(page.getByTestId('trade-preview')).toContainText('After this trade');
      if ((await enabled(confirm)) && (await tryClick(confirm))) return 'traded';
    }
    await tryClick(pass);
    return 'acted';
  }
  return 'idle';
}

/** First-time players get the tutorial when they reach the table; close it if present. */
async function dismissTutorial(page: Page) {
  const close = page.getByTestId('tutorial-close');
  await expect(close).toBeVisible();
  await close.click();
  await expect(page.getByTestId('tutorial')).toHaveCount(0);
}

async function openPlayer(browser: Browser, name: string, code?: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(code ? `/?room=${code}` : '/');
  await page.getByTestId('name-input').fill(name);
  if (code) {
    await expect(page.getByTestId('code-input')).toHaveValue(code);
    await page.getByTestId('join-room').click();
  } else {
    await page.getByTestId('create-room').click();
  }
  await expect(page.getByTestId('room-code')).toBeVisible();
  return page;
}

test('two browsers create/join a room, post quotes, trade, settle and agree', async ({ browser }) => {
  const ada = await openPlayer(browser, 'Ada');
  const code = (await ada.getByTestId('room-code').textContent())!.trim();
  expect(code).toMatch(/^[A-Z2-9]{5}$/);

  const bo = await openPlayer(browser, 'Bo', code);
  await expect(ada.getByTestId('lobby-seat-1')).toContainText('Bo');
  await expect(bo.getByTestId('lobby-seat-0')).toContainText('Ada');

  // Host fills the remaining seats with bots at chosen difficulties, then starts.
  await ada.getByTestId('difficulty-2').selectOption('easy');
  await ada.getByTestId('difficulty-3').selectOption('hard');
  await expect(bo.getByTestId('lobby-seat-3')).toContainText('Hard bot');
  await expect(bo.getByTestId('start-match')).toHaveCount(0); // only the host can start
  await ada.getByTestId('start-match').click();

  // Both see the sealed-quote phase with their own card and nobody else's (after the first-time tutorial).
  for (const p of [ada, bo]) {
    await dismissTutorial(p);
    await expect(p.getByTestId('phase')).toHaveText('Sealed quotes');
    await expect(p.getByTestId('quote-panel')).toBeVisible();
    await expect(p.getByTestId('coach')).toContainText('fair estimate');
  }
  const adaCards = ada.locator('[data-testid="card"]:not([data-value="hidden"])');
  await expect(adaCards).toHaveCount(1); // only her private card is face up
  await expect(ada.locator('[data-testid="community"] [data-value="hidden"]')).toHaveCount(3);

  // Ada posts a two-way market (both sides are on by default, prefilled with suggestions); Bo posts nothing.
  await expect(ada.getByTestId('bid-input')).not.toHaveValue('');
  await ada.getByTestId('bid-input').fill('30');
  await ada.getByTestId('ask-input').fill('60'); // far above fair value so bots leave it for Bo
  await expect(ada.getByTestId('quote-panel')).toContainText('the most you could lose is 45');
  await ada.getByTestId('confirm-quote').click();
  await expect(ada.getByTestId('quote-panel')).toContainText('sealed quote is confirmed');
  // Bo must not see Ada's sealed prices before publication.
  await expect(bo.getByTestId('seat-0')).toContainText('Quote confirmed');
  await expect(bo.getByTestId('seat-0')).not.toContainText('30');
  await bo.getByTestId('skip-quote').click();

  await expect(ada.getByTestId('phase')).toHaveText('Trading');
  await expect(bo.getByTestId('bid-0')).toHaveText('30');
  await expect(bo.getByTestId('ask-0')).toHaveText('60');

  // Drive both players until a trade happens and the round settles.
  let traded = false;
  for (let i = 0; i < 200; i++) {
    const settled = await ada.getByTestId('settlement-value').isVisible().catch(() => false);
    if (settled) break;
    const a = await act(ada, false);
    const b = await act(bo, !traded);
    if (b === 'traded') traded = true;
    if (a === 'idle' && b === 'idle') await ada.waitForTimeout(250);
  }
  expect(traded).toBe(true);

  // Round review: both clients agree on the revealed cards, settlement value and balances.
  await expect(ada.getByTestId('settlement-value')).toBeVisible();
  await expect(bo.getByTestId('settlement-value')).toBeVisible();
  const vA = await ada.getByTestId('settlement-value').textContent();
  const vB = await bo.getByTestId('settlement-value').textContent();
  expect(vA).toBe(vB);
  const rowsA = await ada.getByTestId('results-table').locator('tbody tr').allTextContents();
  const rowsB = await bo.getByTestId('results-table').locator('tbody tr').allTextContents();
  expect(rowsA.map((r) => r.replace(' (you)', ''))).toEqual(rowsB.map((r) => r.replace(' (you)', '')));
  const balances = await ada.getByTestId('results-table').locator('tbody tr td:last-child').allTextContents();
  expect(balances.map(Number).reduce((x, y) => x + y, 0)).toBe(400);
  await expect(ada.locator('[data-testid="reveal-row"] [data-testid="card"]')).toHaveCount(7);
  await expect(bo.getByText('Bought from').first()).toBeVisible(); // Bo may also have bought from bots

  // Ready up: match moves on to round 2.
  await ada.getByTestId('ready').click();
  await bo.getByTestId('ready').click();
  await expect(ada.getByTestId('phase')).toHaveText('Sealed quotes');
  await expect(ada.getByText('Round 2/10')).toBeVisible();
});

test('reconnecting restores the seat without restarting the match', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  await page.getByTestId('name-input').fill('Solo');
  await page.getByTestId('create-room').click();
  await page.getByTestId('start-match').click();
  await dismissTutorial(page);
  await expect(page.getByTestId('quote-panel')).toBeVisible();
  const card = await page.locator('[data-testid="card"]:not([data-value="hidden"])').first().getAttribute('data-value');
  await page.getByTestId('confirm-quote').click();
  await expect(page.getByTestId('phase')).toHaveText('Trading');

  await page.reload();
  await expect(page.getByTestId('phase')).toHaveText('Trading');
  await expect(page.getByText('Round 1/10')).toBeVisible();
  const cardAfter = await page.locator('[data-testid="card"]:not([data-value="hidden"])').first().getAttribute('data-value');
  expect(cardAfter).toBe(card);
  await expect(page.getByTestId('seat-0')).not.toContainText('Takeover');
});

test('closing the tab and reopening the invite link restores the seat and ends the takeover', async ({ browser }) => {
  const ada = await openPlayer(browser, 'Ada');
  const code = (await ada.getByTestId('room-code').textContent())!.trim();
  const bo = await openPlayer(browser, 'Bo', code);
  await ada.getByTestId('start-match').click();
  for (const p of [ada, bo]) await dismissTutorial(p);
  await expect(bo.getByTestId('quote-panel')).toBeVisible();
  const card = await bo.locator('[data-testid="card"]:not([data-value="hidden"])').first().getAttribute('data-value');
  const balance = await ada.getByTestId('seat-1').locator('.num').textContent();

  // Bo closes the tab: a bot takes over the seat.
  const context = bo.context();
  await bo.close();
  await expect(ada.getByTestId('takeover-1')).toBeVisible();

  // Bo opens the invite link again in the same browser and gets the seat back, match still running.
  const again = await context.newPage();
  await again.goto(`/?room=${code}`);
  await expect(again.getByTestId('phase')).toBeVisible();
  await expect(again.getByText('Round 1/10')).toBeVisible();
  await expect(again.getByTestId('seat-1')).toContainText('(you)');
  const cardAfter = await again.locator('[data-testid="card"]:not([data-value="hidden"])').first().getAttribute('data-value');
  expect(cardAfter).toBe(card);
  await expect(again.getByTestId('seat-1').locator('.num')).toHaveText(balance!);
  await expect(ada.getByTestId('takeover-1')).toHaveCount(0);
});

test("another room's invite link does not reuse this room's seat", async ({ browser }) => {
  const ada = await openPlayer(browser, 'Ada');
  const other = await openPlayer(browser, 'Cy');
  const otherCode = (await other.getByTestId('room-code').textContent())!.trim();

  const page = await ada.context().newPage();
  await page.goto(`/?room=${otherCode}`);
  await expect(page.getByTestId('code-input')).toHaveValue(otherCode);
  await expect(page.getByTestId('room-code')).toHaveCount(0);
});

test('leaving a room forgets its seat', async ({ browser }) => {
  const ada = await openPlayer(browser, 'Ada');
  const code = (await ada.getByTestId('room-code').textContent())!.trim();
  await openPlayer(browser, 'Bo', code); // keeps the room alive after Ada leaves
  await ada.getByRole('button', { name: 'Leave table' }).click();
  await expect(ada.getByTestId('name-input')).toBeVisible();

  await ada.goto(`/?room=${code}`);
  await expect(ada.getByTestId('code-input')).toHaveValue(code);
  await expect(ada.getByTestId('room-code')).toHaveCount(0);
});

test('a stored seat for a room that no longer exists falls back to the join screen with a message', async ({ browser }) => {
  const ada = await openPlayer(browser, 'Ada');
  const code = (await ada.getByTestId('room-code').textContent())!.trim();
  // Simulate the server forgetting the room (e.g. a restart) by corrupting the seat stored for it.
  const corrupted = await ada.evaluate((c) => {
    let n = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      if (key.endsWith(c)) {
        localStorage.setItem(key, 'stale-token');
        n++;
      }
    }
    return n;
  }, code);
  expect(corrupted).toBe(1);

  await ada.goto(`/?room=${code}`);
  await expect(ada.getByRole('alert')).toBeVisible();
  await expect(ada.getByTestId('code-input')).toHaveValue(code);
  await expect(ada.getByTestId('room-code')).toHaveCount(0);
});

/** Socket.IO frames are engine.io message "4" + packet type (2 event, 3 ack) + optional ack id + JSON. */
const eventFrame = (event: string) => new RegExp(`^42(\\d*)\\["${event}"`);

test('leaving a room forgets its seat even if the server never answers', async ({ browser }) => {
  const context = await browser.newContext();
  // Swallow the leaveRoom message so its ack never arrives.
  await context.routeWebSocket(/\/socket\.io\//, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((m) => {
      if (typeof m === 'string' && eventFrame('leaveRoom').test(m)) return;
      server.send(m);
    });
  });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByTestId('name-input').fill('Ada');
  await page.getByTestId('create-room').click();
  const code = (await page.getByTestId('room-code').textContent())!.trim();

  await page.getByRole('button', { name: 'Leave table' }).click();
  await expect(page.getByTestId('name-input')).toBeVisible();
  await page.goto(`/?room=${code}`);
  await expect(page.getByTestId('code-input')).toHaveValue(code);
  await expect(page.getByTestId('room-code')).toHaveCount(0);
});

test('a reconnect during a rejoin retry leaves only one rejoin chain running', async ({ browser }) => {
  const ada = await openPlayer(browser, 'Ada');
  const code = (await ada.getByTestId('room-code').textContent())!.trim();
  const context = ada.context();
  // Make Socket.IO's reconnect delay 800 ms (jitter fixed), ahead of the client's first 1000 ms rejoin retry.
  await context.addInitScript(() => {
    Math.random = () => 0.4;
  });
  let rejoins = 0;
  await context.routeWebSocket(/\/socket\.io\//, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((m) => {
      const rejoin = typeof m === 'string' ? eventFrame('rejoin').exec(m) : null;
      if (rejoin && ++rejoins === 1) {
        // First rejoin: answer with a transient failure, then drop the connection so the client
        // reconnects while its retry timer is still pending.
        ws.send(`43${rejoin[1]}[{"ok":false,"error":"try again"}]`);
        ws.close();
        return;
      }
      server.send(m);
    });
  });

  const page = await context.newPage();
  await page.goto(`/?room=${code}`);
  await expect(page.getByTestId('room-code')).toHaveText(code);
  // Long enough for every retry a stale chain could still send.
  await page.waitForTimeout(4_000);
  expect(rejoins).toBe(2);
});
