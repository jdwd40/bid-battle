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
