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

/** One fixed or sticky element's on-screen vertical extent, as reported by `measureFixedCoverage`. */
export interface FixedElement {
  /** Tag, test id and classes, e.g. `div[data-testid=status-bar].table-head`. */
  label: string;
  top: number;
  bottom: number;
}

export interface FixedCoverage {
  /** Share of the viewport height covered by fixed and sticky elements, from 0 to 1. */
  share: number;
  viewportHeight: number;
  /** The elements that contributed, for failure messages. */
  elements: FixedElement[];
}

/**
 * Measure how much of the viewport height is covered by `position: fixed` and `position: sticky`
 * elements at the current scroll position (no scrolling is done). Overlapping elements, side-by-side
 * elements and nested ones count once: the result is the union of their vertical extents, clipped
 * to the viewport. A sticky element counts wherever it currently is on screen, stuck or not.
 * Measure with no modal open: a full-screen backdrop covers the whole viewport.
 */
export async function measureFixedCoverage(page: Page): Promise<FixedCoverage> {
  return page.evaluate(() => {
    const height = window.innerHeight;
    const elements: { label: string; top: number; bottom: number }[] = [];
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
      const style = getComputedStyle(el);
      if (style.position !== 'fixed' && style.position !== 'sticky') continue;
      if (style.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      const top = Math.max(0, r.top);
      const bottom = Math.min(height, r.bottom);
      if (r.width === 0 || bottom <= top) continue;
      const id = el.dataset.testid ? `[data-testid=${el.dataset.testid}]` : '';
      const cls = typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).join('.')}` : '';
      elements.push({ label: `${el.tagName.toLowerCase()}${id}${cls}`, top: Math.round(top), bottom: Math.round(bottom) });
    }
    let covered = 0;
    let reach = 0;
    for (const { top, bottom } of [...elements].sort((a, b) => a.top - b.top)) {
      const from = Math.max(top, reach);
      if (bottom > from) covered += bottom - from;
      reach = Math.max(reach, bottom);
    }
    return { share: covered / height, viewportHeight: height, elements };
  });
}

/**
 * Assert fixed and sticky elements cover at most `maxShare` (0 to 1) of the viewport height at the
 * current scroll position, e.g. `expectFixedCoverageAtMost(page, 0.25, 'table on my turn')`.
 * On failure it lists the covering elements. `where` labels the screen in the failure message.
 */
export async function expectFixedCoverageAtMost(page: Page, maxShare: number, where: string): Promise<void> {
  const { share, viewportHeight, elements } = await measureFixedCoverage(page);
  const list = elements.map((e) => `${e.label} ${e.top}-${e.bottom}`).join(', ') || 'none';
  expect(share, `${where}: fixed/sticky elements cover ${Math.round(share * 100)}% of a ${viewportHeight}px viewport (${list})`).toBeLessThanOrEqual(maxShare);
}
