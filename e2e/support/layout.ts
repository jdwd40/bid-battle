import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Assert the page has no horizontal overflow: nothing pushes the document wider than the viewport.
 * Content inside its own scrolling or clipping container (`overflow-x: auto`, wide tables) is allowed.
 * On failure it names the elements sticking out past the right edge, so the culprit is easy to find.
 * `where` labels the screen in the failure message (e.g. 'table', 'lobby').
 */
export async function expectNoHorizontalOverflow(page: Page, where: string): Promise<void> {
  const report = await page.evaluate(() => {
    const root = document.documentElement;
    const width = root.clientWidth;
    const offenders: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.right <= width + 1) continue;
      let clipped = false;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (getComputedStyle(p).overflowX !== 'visible') {
          clipped = true;
          break;
        }
      }
      if (clipped) continue;
      const id = el.dataset.testid ? `[data-testid=${el.dataset.testid}]` : '';
      const cls = typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).join('.')}` : '';
      offenders.push(`${el.tagName.toLowerCase()}${id}${cls} right=${Math.round(r.right)}`);
    }
    return { scrollWidth: root.scrollWidth, width, offenders: offenders.slice(0, 10) };
  });
  expect({ scrollWidth: report.scrollWidth, offenders: report.offenders }, `${where} overflows a ${report.width}px viewport`).toEqual({
    scrollWidth: report.width,
    offenders: [],
  });
}

/** Assert each locator is fully inside the viewport at the current scroll position (no scrolling is done). */
export async function expectFullyInViewport(...locators: Locator[]): Promise<void> {
  for (const loc of locators) await expect(loc).toBeInViewport({ ratio: 1 });
}
