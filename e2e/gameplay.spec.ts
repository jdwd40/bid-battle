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
 * One tick of "play sensibly": answer counter-offers, lock a quote when asked,
 * buy the best ask once if allowed (when `wantsTrade`), otherwise pass. Never readies up.
 * Returns what the page did so the driver can stop when the goal is reached.
 */
async function act(page: Page, wantsTrade: boolean): Promise<'traded' | 'acted' | 'idle'> {
  if (await page.getByTestId('decline-counter').isVisible().catch(() => false)) {
    await tryClick(page.getByTestId('decline-counter'));
    return 'acted';
  }
  const lock = page.getByTestId('lock-quote');
  if ((await lock.isVisible().catch(() => false)) && (await enabled(lock))) {
    await tryClick(lock);
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

  // Host fills the remaining seats with AI at chosen difficulties, then starts.
  await ada.getByTestId('difficulty-2').selectOption('easy');
  await ada.getByTestId('difficulty-3').selectOption('hard');
  await expect(bo.getByTestId('lobby-seat-3')).toContainText('Hard AI');
  await expect(bo.getByTestId('start-match')).toHaveCount(0); // only the host can start
  await ada.getByTestId('start-match').click();

  // Both see the sealed-quote phase with their own card and nobody else's (after the first-time tutorial).
  for (const p of [ada, bo]) {
    await dismissTutorial(p);
    await expect(p.getByTestId('phase')).toHaveText('Sealed quotes');
    await expect(p.getByTestId('quote-panel')).toBeVisible();
    await expect(p.getByTestId('coach')).toContainText('rough guess');
  }
  const adaCards = ada.locator('[data-testid="card"]:not([data-value="hidden"])');
  await expect(adaCards).toHaveCount(1); // only her private card is face up
  await expect(ada.locator('[data-testid="community"] [data-value="hidden"]')).toHaveCount(3);

  // Ada posts a two-way market (both sides are on by default, prefilled with suggestions); Bo posts nothing.
  await expect(ada.getByTestId('bid-input')).not.toHaveValue('');
  await ada.getByTestId('bid-input').fill('30');
  await ada.getByTestId('ask-input').fill('60'); // far above fair value so bots leave it for Bo
  await expect(ada.getByTestId('quote-panel')).toContainText('the most you could lose is 45');
  await ada.getByTestId('lock-quote').click();
  await expect(ada.getByTestId('quote-panel')).toContainText('locked');
  // Bo must not see Ada's sealed prices before publication.
  await expect(bo.getByTestId('seat-0')).toContainText('Quote locked');
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
  await expect(bo.getByText('Bought from')).toBeVisible();

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
  await page.getByTestId('lock-quote').click();
  await expect(page.getByTestId('phase')).toHaveText('Trading');

  await page.reload();
  await expect(page.getByTestId('phase')).toHaveText('Trading');
  await expect(page.getByText('Round 1/10')).toBeVisible();
  const cardAfter = await page.locator('[data-testid="card"]:not([data-value="hidden"])').first().getAttribute('data-value');
  expect(cardAfter).toBe(card);
  await expect(page.getByTestId('seat-0')).not.toContainText('AI playing');
});
