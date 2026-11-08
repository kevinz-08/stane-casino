import { expect, test } from '@playwright/test';
import { clickAndSettle, playToEnd, signUpAndOpenTable } from './helpers';

test('on a phone the whole table fits the width and the round is playable', async ({ page }) => {
  await signUpAndOpenTable(page, { speed: 'fast' });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await page.getByRole('button', { name: 'Añadir ficha de 50', exact: true }).click();
  await clickAndSettle(page, page.getByTestId('deal'));
  await playToEnd(page);
  await expect(page.getByTestId('outcome')).toBeVisible();

  // Buttons are comfortably tappable (≥ 44 px, WCAG target size).
  const box = await page.getByTestId('deal').boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
});
