import { expect, test, type Page } from '@playwright/test';
import { expectFullyInViewport, expectNoHorizontalOverflow } from './support/layout';

// Runs only in the `phone` project (see playwright.config.ts): a ~390px-wide touch viewport, on a
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
