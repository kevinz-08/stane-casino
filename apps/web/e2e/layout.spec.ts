import { expect, test } from '@playwright/test';
import { clickAndSettle, signUpAndOpenTable } from './helpers';

/**
 * Regression test: on desktop the whole game (dealer, both hands, controls) must fit in the
 * window without scrolling, at common laptop and monitor sizes.
 */
for (const viewport of [
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
]) {
  test(`desktop ${viewport.width}×${viewport.height}: the game fits the window`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await signUpAndOpenTable(page, { speed: 'instant' });
    await clickAndSettle(page, page.getByTestId('deal'));

    const box = await page.evaluate(() => {
      const bottom = (sel: string) =>
        Math.max(
          0,
          ...Array.from(document.querySelectorAll(sel)).map(
            (e) => e.getBoundingClientRect().bottom,
          ),
        );
      const felt = document.querySelector('[data-testid=table] > div > div') as HTMLElement;
      return {
        viewport: window.innerHeight,
        controls: bottom('[data-testid^="action-"], [data-testid=deal]'),
        cards: bottom('[data-testid=table-card]'),
        feltBottom: felt.getBoundingClientRect().bottom,
        dealerTop: document.querySelector('[data-testid=dealer]')?.getBoundingClientRect().top ?? 0,
      };
    });

    expect(box.controls).toBeLessThanOrEqual(box.viewport);
    expect(box.cards).toBeLessThanOrEqual(box.feltBottom); // nothing clipped by the felt
    expect(box.dealerTop).toBeGreaterThanOrEqual(0);
  });
}
