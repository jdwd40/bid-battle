import { expect, test } from '@playwright/test';
import { expectFullyInViewport, expectNoHorizontalOverflow } from './support/layout';

// Runs only in the `phone` project (see playwright.config.ts): a ~390px-wide touch viewport.

test('a solo match on a phone fits the screen and keeps the action buttons in view on my turn', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('name-input').fill('Pocket');
  await page.getByTestId('create-room').click();
  await page.getByTestId('start-match').click();
  await page.getByTestId('tutorial-close').click();
  await expect(page.getByTestId('tutorial')).toHaveCount(0);

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
});
