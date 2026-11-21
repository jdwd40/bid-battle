import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectFixedCoverageAtMost, expectFullyInViewport, expectNoHorizontalOverflow, measureFixedCoverage } from './support/layout';

// Runs only in the `phone` project (see playwright.config.ts): an iPhone SE-sized (375×667) touch viewport, on a
// server that plays one-round matches so the solo match reaches the match results.

/** Step through every page of the how-to-play tutorial, checking each fits, then close it. */
async function readTutorial(page: Page): Promise<void> {
  const tutorial = page.getByTestId('tutorial');
  await expect(tutorial).toBeVisible();
  for (let step = 1; ; step++) {
    await expectNoHorizontalOverflow(page, `tutorial step ${step}`);
    // The modal scrolls vertically on a phone; its pages must not need sideways scrolling inside it.
    const sideways = await tutorial.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(sideways, `tutorial step ${step} scrolls sideways`).toBeLessThanOrEqual(0);
    const done = page.getByTestId('tutorial-done');
    if (await done.isVisible()) {
      await done.click();
      break;
    }
    await page.getByTestId('tutorial-next').click();
  }
  await expect(tutorial).toHaveCount(0);
}

test('in landscape the tutorial keeps its navigation and close buttons in view on every step', async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 });
  await page.goto('/');
  await page.getByTestId('name-input').fill('Sideways');
  await page.getByTestId('create-room').click();
  await page.getByTestId('start-match').click();

  const tutorial = page.getByTestId('tutorial');
  await expect(tutorial).toBeVisible();
  for (let step = 1; ; step++) {
    const done = page.getByTestId('tutorial-done');
    const last = await done.isVisible();
    const forward = last ? done : page.getByTestId('tutorial-next');
    // No scrolling first: the buttons must be in view as the step opens.
    await expectFullyInViewport(forward, page.getByTestId('tutorial-close'));
    await expectNoHorizontalOverflow(page, `landscape tutorial step ${step}`);
    const sideways = await tutorial.evaluate((el) =>
      Math.max(el.scrollWidth - el.clientWidth, ...Array.from(el.querySelectorAll<HTMLElement>('*')).map((c) => c.scrollWidth - c.clientWidth)),
    );
    expect(sideways, `landscape tutorial step ${step} scrolls sideways`).toBeLessThanOrEqual(0);
    await forward.click();
    if (last) break;
  }
  await expect(tutorial).toHaveCount(0);
});

test('a counter-offer awaiting me shows its modal fully in view, and the action panel is not pinned', async ({ page, browser }) => {
  await page.goto('/');
  await page.getByTestId('name-input').fill('Pocket');
  await page.getByTestId('create-room').click();
  const code = (await page.getByTestId('room-code').textContent())!.trim();

  const rival = await (await browser.newContext()).newPage();
  await rival.goto(`/?room=${code}`);
  await rival.getByTestId('name-input').fill('Rival');
  await rival.getByTestId('join-room').click();
  await expect(rival.getByTestId('room-code')).toBeVisible();

  await page.getByTestId('start-match').click();
  for (const p of [page, rival]) {
    await p.getByTestId('tutorial-close').click();
    await expect(p.getByTestId('tutorial')).toHaveCount(0);
  }

  // Pocket posts only a high ask, which the bots won't buy; Rival posts nothing.
  await page.getByTestId('use-bid').click();
  await page.getByTestId('ask-input').fill('80');
  await page.getByTestId('confirm-quote').click();
  await rival.getByTestId('skip-quote').click();
  await expect(page.getByTestId('phase')).toHaveText('Trading');

  // Pocket passes its turns; on Rival's turn Rival counters Pocket's ask.
  const modal = page.getByTestId('counter-modal');
  await expect(async () => {
    if (await modal.isVisible()) return;
    const pass = page.getByTestId('pass');
    if (await pass.isEnabled()) await pass.click({ timeout: 1_000 }).catch(() => {});
    if (await rival.getByTestId('counter').isEnabled()) {
      await rival.getByTestId('counter').click({ timeout: 1_000 });
      await rival.getByTestId('counter-target').selectOption('ask:0');
      await expectPhonePriceInput(rival.getByTestId('counter-price'));
      await rival.getByTestId('counter-price').fill('79');
      await rival.getByTestId('send-counter').click({ timeout: 1_000 });
    }
    await expect(modal).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 60_000 });

  await page.evaluate(() => window.scrollTo(0, 0));
  await expectNoHorizontalOverflow(page, 'table with a counter-offer awaiting me');
  await expectFullyInViewport(modal, page.getByTestId('accept-counter'), page.getByTestId('decline-counter'));
  await expect(page.getByTestId('action-panel')).not.toHaveClass(/\bpinned\b/);
  await page.getByTestId('decline-counter').click();
  await expect(modal).toHaveCount(0);
});

test('a solo match on a phone fits the screen and keeps the action buttons in view on my turn', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('create-room')).toBeVisible();
  await expectNoHorizontalOverflow(page, 'join screen');

  await page.getByTestId('name-input').fill('Pocket');
  await page.getByTestId('create-room').click();
  await expect(page.getByTestId('start-match')).toBeVisible();
  await expectNoHorizontalOverflow(page, 'lobby');

  // Starting the match opens the how-to-play tutorial over the table.
  await page.getByTestId('start-match').click();
  await readTutorial(page);

  // Quote preparation: the table fits, and the quote form's controls are reachable.
  await expect(page.getByTestId('quote-panel')).toBeVisible();
  await expectNoHorizontalOverflow(page, 'table during quote preparation');
  await page.getByTestId('confirm-quote').click();
  await expect(page.getByTestId('phase')).toHaveText('Trading');

  // Wait for my turn, then check from the top of the page: no scrolling to find the buttons.
  const pass = page.getByTestId('pass');
  await expect(pass).toBeEnabled({ timeout: 30_000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await expectNoHorizontalOverflow(page, 'table on my turn');
  await expectFullyInViewport(page.getByTestId('buy'), page.getByTestId('sell'), page.getByTestId('counter'), pass);
  await expect(page.getByTestId('action-panel')).toHaveClass(/\bpinned\b/);

  // Play out the round: confirm each quote and pass each turn until the round review.
  const ready = page.getByTestId('ready');
  await expect(async () => {
    if (await ready.isVisible()) return;
    for (const id of ['confirm-quote', 'pass']) {
      const button = page.getByTestId(id);
      if ((await button.isVisible()) && (await button.isEnabled())) await button.click({ timeout: 2_000 }).catch(() => {});
    }
    await expect(ready).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 120_000 });
  await expectNoHorizontalOverflow(page, 'round review');

  // The only round is over, so being ready goes to the match results.
  await ready.click();
  await expect(page.getByTestId('winner-line')).toBeVisible();
  await expectNoHorizontalOverflow(page, 'match results');
});

test('the status bar keeps the timer and my fair estimate in view while I scroll the table', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('name-input').fill('Pocket');
  await page.getByTestId('create-room').click();
  await page.getByTestId('start-match').click();
  await page.getByTestId('tutorial-close').click();
  await expect(page.getByTestId('quote-panel')).toBeVisible();

  const statusBar = page.getByTestId('status-bar');
  const timer = statusBar.getByTestId('countdown');
  const estimate = statusBar.getByTestId('fair-estimate');
  await expect(estimate).toHaveText(/^Fair \d+$/);

  await page.evaluate(() => window.scrollTo(0, 0));
  await expectFullyInViewport(timer, estimate);
  await expectFixedCoverageAtMost(page, 0.12, 'table at the top');

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  expect(await page.evaluate(() => window.scrollY), 'the table is taller than the screen').toBeGreaterThan(0);
  await expectFullyInViewport(timer, estimate);
  await expectFixedCoverageAtMost(page, 0.12, 'table scrolled to the bottom');
});

test('during quote preparation the whole quote form is on my first screen', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('name-input').fill('Pocket');
  await page.getByTestId('create-room').click();
  await page.getByTestId('start-match').click();
  await page.getByTestId('tutorial-close').click();
  await expect(page.getByTestId('quote-panel')).toBeVisible();
  // No scrolling: tapping Start further down the lobby must not leave the table scrolled past the form.

  // My private card and the community cards share one strip above the form.
  const strip = page.getByTestId('card-strip');
  await expect(strip.getByTestId('card')).toHaveCount(4);
  await expect(strip).toContainText('Yours');
  await expect(strip).toContainText('Settlement');

  const bid = page.getByTestId('bid-input');
  const ask = page.getByTestId('ask-input');
  const confirm = page.getByTestId('confirm-quote');
  await expectFullyInViewport(strip, page.getByTestId('use-bid'), page.getByTestId('use-ask'), bid, ask, confirm);
  await expectNoHorizontalOverflow(page, 'quote form');

  for (const id of ['use-bid', 'use-ask']) {
    const box = (await page.getByTestId(id).boundingBox())!;
    expect(box.height, `${id} tap height`).toBeGreaterThanOrEqual(44);
  }
  for (const input of [bid, ask]) await expectPhonePriceInput(input);

  // A refused quote (bid above ask) says why directly above Confirm.
  await bid.fill('60');
  await ask.fill('40');
  await expect(confirm).toBeDisabled();
  const refusal = page.getByTestId('quote-error');
  await expect(refusal).toBeVisible();
  await expectDirectlyAbove(refusal, confirm);
  await expectFullyInViewport(refusal, confirm);
});

test('during trading every trader is a compact row right below the card strip, and my stat details are one tap away', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('name-input').fill('Pocket');
  await page.getByTestId('create-room').click();
  await page.getByTestId('start-match').click();
  await page.getByTestId('tutorial-close').click();
  await page.getByTestId('confirm-quote').click();
  await expect(page.getByTestId('phase')).toHaveText('Trading');

  // On my turn, from the top of the page: every trader's row, bid and ask are on the first screen.
  await expect(page.getByTestId('pass')).toBeEnabled({ timeout: 30_000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  const count = await page.locator('[data-testid^="seat-"]').count();
  expect(count, 'traders at the table').toBeGreaterThanOrEqual(2);
  for (let i = 0; i < count; i++) {
    await expectFullyInViewport(page.getByTestId(`seat-${i}`), page.getByTestId(`bid-${i}`), page.getByTestId(`ask-${i}`));
  }
  await expectNoHorizontalOverflow(page, 'trader rows');

  // The rows start right below the card strip, one compact row per trader.
  const strip = (await page.getByTestId('card-strip').boundingBox())!;
  const first = (await page.getByTestId('seat-0').boundingBox())!;
  const gap = first.y - (strip.y + strip.height);
  expect(gap, 'gap between the card strip and the first trader row').toBeGreaterThanOrEqual(0);
  expect(gap, 'gap between the card strip and the first trader row').toBeLessThanOrEqual(40);
  for (let i = 0; i < count; i++) {
    const box = (await page.getByTestId(`seat-${i}`).boundingBox())!;
    expect(box.height, `trader row ${i} height`).toBeLessThanOrEqual(56);
    if (i > 0) {
      const prev = (await page.getByTestId(`seat-${i - 1}`).boundingBox())!;
      expect(box.y, `trader row ${i} sits below row ${i - 1}`).toBeGreaterThanOrEqual(prev.y + prev.height - 1);
    }
  }

  // It is my turn, so my row (I created the room: seat 0) is the one marked active, and it says "You". Bots say so.
  const mine = page.getByTestId('seat-0');
  await expect(mine).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('[data-testid^="seat-"][aria-current="true"]')).toHaveCount(1);
  await expect(mine).toContainText('You');
  await expect(page.getByTestId('seat-1')).toContainText('Bot');

  // Available and Position are in the play area; Balance, Cashflow and Reserved risk wait behind Details.
  await expect(page.getByTestId('available')).toBeVisible();
  await expect(page.getByTestId('position')).toBeVisible();
  const cashflow = page.getByText('Cashflow', { exact: true });
  for (const hidden of [page.getByTestId('balance'), page.getByTestId('reserved'), cashflow]) await expect(hidden).not.toBeVisible();
  await page.getByTestId('stat-details').click();
  for (const shown of [page.getByTestId('balance'), page.getByTestId('reserved'), cashflow]) await expect(shown).toBeVisible();
});

test('in round 1 the coach is open below the play area, and activity and help open on tap', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('name-input').fill('Pocket');
  await page.getByTestId('create-room').click();
  await page.getByTestId('start-match').click();
  await page.getByTestId('tutorial-close').click();
  await expect(page.getByTestId('quote-panel')).toBeVisible();

  // The coach is open in round 1, below the quote form.
  const tip = page.getByTestId('coach-tip');
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('fair estimate');
  const confirm = (await page.getByTestId('confirm-quote').boundingBox())!;
  const coach = (await page.getByTestId('coach').boundingBox())!;
  expect(coach.y, 'the coach sits below the quote form').toBeGreaterThan(confirm.y);

  // Activity and help start collapsed; tapping a title opens it without sideways overflow.
  const feed = page.getByTestId('activity-feed');
  const rules = page.getByText('Settlement value', { exact: true });
  await expect(feed).toBeHidden();
  await expect(rules).toBeHidden();
  await page.getByText('Activity', { exact: true }).click();
  await expect(feed).toBeVisible();
  await page.getByText('Rules & glossary', { exact: true }).click();
  await expect(rules).toBeVisible();
  await expectNoHorizontalOverflow(page, 'table with every section open');

  // Tapping the coach's title closes and reopens it.
  await page.getByTestId('coach-title').click();
  await expect(tip).toBeHidden();
  await page.getByTestId('coach-title').click();
  await expect(tip).toBeVisible();
  await expectNoHorizontalOverflow(page, 'table with the coach reopened');
});

test('from round 2 the coach shows only its title until I tap it', async ({ page }, testInfo) => {
  // This project's server plays one-round matches; the chromium project's server, one port below, plays full matches.
  const fullMatch = new URL(testInfo.project.use.baseURL!);
  fullMatch.port = String(Number(fullMatch.port) - 1);
  await page.goto(fullMatch.href);
  await page.getByTestId('name-input').fill('Pocket');
  await page.getByTestId('create-room').click();
  await page.getByTestId('start-match').click();
  await page.getByTestId('tutorial-close').click();
  await expect(page.getByTestId('coach-tip')).toBeVisible();

  // Play out round 1: confirm each quote and pass each turn until the round review, then be ready.
  const ready = page.getByTestId('ready');
  await expect(async () => {
    if (await ready.isVisible()) return;
    for (const id of ['confirm-quote', 'pass']) {
      const button = page.getByTestId(id);
      if ((await button.isVisible()) && (await button.isEnabled())) await button.click({ timeout: 2_000 }).catch(() => {});
    }
    await expect(ready).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 120_000 });
  await ready.click();

  await expect(page.getByTestId('status-bar')).toContainText(/Round 2\//);
  await expect(page.getByTestId('quote-panel')).toBeVisible();
  const title = page.getByTestId('coach-title');
  const tip = page.getByTestId('coach-tip');
  await expect(title).toBeVisible();
  await expect(tip).toBeHidden();

  await title.click();
  await expect(tip).toBeVisible();
  await expectNoHorizontalOverflow(page, 'round 2 table with the coach open');
});

/** Create a solo room, start the match, close the tutorial and confirm the suggested quote, so trading starts. */
async function startSoloTrading(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByTestId('name-input').fill('Pocket');
  await page.getByTestId('create-room').click();
  await page.getByTestId('start-match').click();
  await page.getByTestId('tutorial-close').click();
  await page.getByTestId('confirm-quote').click();
  await expect(page.getByTestId('phase')).toHaveText('Trading');
}

test("on my turn a one-row action bar leaves every trader's prices uncovered, and nothing is pinned otherwise", async ({ page }) => {
  await startSoloTrading(page);
  const pass = page.getByTestId('pass');
  await expect(pass).toBeEnabled({ timeout: 30_000 });
  await page.evaluate(() => window.scrollTo(0, 0));

  // Portrait: every trader's bid and ask and all four actions are in view together, and the bar covers none of them.
  const actions = ['buy', 'sell', 'counter', 'pass'].map((id) => page.getByTestId(id));
  await expectFullyInViewport(...actions);
  const count = await page.locator('[data-testid^="seat-"]').count();
  for (let i = 0; i < count; i++) {
    for (const id of [`bid-${i}`, `ask-${i}`]) {
      await expectFullyInViewport(page.getByTestId(id));
      await expectUncovered(page.getByTestId(id));
    }
  }
  for (const action of actions) await expectUncovered(action);
  const tops = await Promise.all(actions.map(async (a) => Math.round((await a.boundingBox())!.y)));
  expect(new Set(tops).size, `the four actions are on one row (tops ${tops.join(', ')})`).toBe(1);
  await expect(page.getByTestId('action-panel')).toHaveClass(/\bpinned\b/);
  await expectFixedCoverageAtMost(page, 0.25, 'portrait table on my turn');

  // Landscape: the same bar, with a little more room allowed for the fixed bars.
  await page.setViewportSize({ width: 667, height: 375 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(pass).toBeEnabled();
  await expectFullyInViewport(...actions);
  await expectFixedCoverageAtMost(page, 0.3, 'landscape table on my turn');
  await page.setViewportSize({ width: 375, height: 667 });

  // Once I pass it is someone else's turn (or, if I acted last, the next quote preparation): only the status bar stays fixed.
  await pass.click();
  await expect(page.locator('[data-testid=pass]:enabled')).toHaveCount(0);
  await expect(page.locator('[data-testid=action-panel].pinned')).toHaveCount(0);
  const { elements } = await measureFixedCoverage(page);
  expect(
    elements.filter((e) => !e.label.includes('status-bar')).map((e) => e.label),
    'fixed elements off my turn',
  ).toEqual([]);
});

test('Buy opens a bottom sheet with the trade confirmation, and Cancel returns to the table', async ({ page }) => {
  await startSoloTrading(page);
  // Buy needs another trader's ask I can afford: pass any turn without one, and re-confirm quotes between cycles.
  const buy = page.getByTestId('buy');
  await expect(async () => {
    if (await buy.isEnabled()) return;
    for (const id of ['confirm-quote', 'pass']) {
      const button = page.getByTestId(id);
      if ((await button.isVisible()) && (await button.isEnabled())) await button.click({ timeout: 2_000 }).catch(() => {});
    }
    await expect(buy).toBeEnabled({ timeout: 1_000 });
  }).toPass({ timeout: 60_000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await buy.click();

  const sheet = page.getByTestId('action-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId('trade-preview')).toBeVisible();
  const confirm = sheet.getByTestId('confirm-trade');
  const cancel = sheet.getByTestId('cancel-action');
  await expect(cancel).toHaveText('Cancel');
  await expectFullyInViewport(confirm, cancel);
  await expectUncovered(confirm);
  await expectNoHorizontalOverflow(page, 'trade sheet');

  await cancel.click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId('action-panel')).toHaveClass(/\bpinned\b/);
  await expectFullyInViewport(buy, page.getByTestId('pass'));
  await expectUncovered(buy);
});

/** A price input brings up a numeric keypad and has text large enough that iOS doesn't zoom on focus. */
async function expectPhonePriceInput(input: Locator): Promise<void> {
  await expect(input).toHaveAttribute('inputmode', 'numeric');
  const size = await input.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size, 'price input text size').toBeGreaterThanOrEqual(16);
}

/** `upper` sits right above `lower`: at most a small gap between them, and they overlap horizontally. */
async function expectDirectlyAbove(upper: Locator, lower: Locator): Promise<void> {
  const a = (await upper.boundingBox())!;
  const b = (await lower.boundingBox())!;
  const gap = b.y - (a.y + a.height);
  expect(gap, 'gap between the message and the control below it').toBeGreaterThanOrEqual(0);
  expect(gap, 'gap between the message and the control below it').toBeLessThanOrEqual(16);
  expect(Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x), 'horizontal overlap').toBeGreaterThan(0);
}

/**
 * Nothing is drawn over `loc`: at its centre and near each corner, the topmost element is `loc` or inside it.
 * (toBeInViewport ignores overlap, so a pinned bar on top of an element would still pass it.)
 */
async function expectUncovered(loc: Locator): Promise<void> {
  const covering = await loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    // Probes sit a little in from the corners: hit-testing skips the corners that a border radius cuts off.
    const at = (fx: number, fy: number) => [r.left + r.width * fx, r.top + r.height * fy];
    const points = [at(0.5, 0.5), at(0.2, 0.2), at(0.8, 0.2), at(0.2, 0.8), at(0.8, 0.8)];
    for (const [x, y] of points) {
      const top = document.elementFromPoint(x, y) as HTMLElement | null;
      if (!top || !(el === top || el.contains(top))) {
        const id = top?.dataset.testid ? `[data-testid=${top.dataset.testid}]` : '';
        return `${top?.tagName.toLowerCase() ?? 'nothing'}${id}.${top?.className ?? ''} at ${Math.round(x)},${Math.round(y)}`;
      }
    }
    return null;
  });
  expect(covering, `something covers ${loc}`).toBeNull();
}
