import { expect, test } from '@playwright/test';
import {
  clickAndSettle,
  playToEnd,
  serverRound,
  settle,
  shownCards,
  signUpAndOpenTable,
} from './helpers';

test.describe('blackjack table', () => {
  test('what the table shows at the end of a round is exactly what the server decided (20 rounds)', async ({
    page,
  }) => {
    test.setTimeout(300_000); // 20 full rounds at the (deliberately unhurried) table pace
    await signUpAndOpenTable(page, { speed: 'fast' });
    for (let round = 0; round < 20; round++) {
      await clickAndSettle(page, page.getByTestId('deal'));
      await playToEnd(page);

      const id = await page.getByTestId('table').getAttribute('data-round-id');
      const server = await serverRound(page, id as string);
      const shown = await shownCards(page);

      expect(shown.dealer).toEqual(server.view.dealer.cards);
      expect(shown.hands).toEqual(
        server.view.hands.map((h) => ({ cards: h.cards, result: h.result })),
      );
      await expect(page.getByTestId('outcome')).toBeVisible();
      // The header balance is the server's balance once the animation has finished.
      await expect(page.getByTestId('balance')).toContainText(
        new Intl.NumberFormat('es-ES').format(Number(server.balance)),
      );
    }
  });

  test('the hole card never reaches the page before it is revealed', async ({ page }) => {
    await signUpAndOpenTable(page, { speed: 'fast' });
    let checked = 0;
    for (let attempt = 0; attempt < 10 && checked < 3; attempt++) {
      await clickAndSettle(page, page.getByTestId('deal'));
      if ((await page.getByTestId('table').getAttribute('data-phase')) === 'SETTLED') continue;

      const html = await page.getByTestId('dealer-cards').innerHTML();
      const dealerCards = await shownCards(page).then((s) => s.dealer);
      expect(dealerCards).toHaveLength(2);
      expect(dealerCards[1]).toBeNull();

      await playToEnd(page);
      const id = await page.getByTestId('table').getAttribute('data-round-id');
      const server = await serverRound(page, id as string);
      const hole = server.view.dealer.cards[1] as string;
      // The face of the hole card was not in the DOM (no data-card, no aria label).
      expect(html).not.toContain(`data-card="${hole}"`);
      expect(html.match(/data-card="/g) ?? []).toHaveLength(1);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  test('cards fly in one by one at normal speed, and a click skips to the end', async ({
    page,
  }) => {
    await signUpAndOpenTable(page, { speed: 'normal' });
    await page.getByTestId('deal').click();
    await expect(page.getByTestId('table')).toHaveAttribute('data-animating', 'true');
    // Mid-animation, fewer than the 4 initial cards are on the table.
    await page.waitForTimeout(500);
    expect(await page.getByTestId('table-card').count()).toBeLessThan(4);

    await page.getByTestId('table').click({ position: { x: 40, y: 400 } });
    await settle(page);
    expect(await page.getByTestId('table-card').count()).toBeGreaterThanOrEqual(4);
  });

  test('keyboard: space deals, S stands, Escape skips the animation', async ({ page }) => {
    await signUpAndOpenTable(page, { speed: 'normal' });
    await page.keyboard.press(' ');
    await expect(page.getByTestId('table')).toHaveAttribute('data-animating', 'true');
    await page.keyboard.press('Escape');
    await settle(page);
    for (let i = 0; i < 6; i++) {
      const phase = await page.getByTestId('table').getAttribute('data-phase');
      if (phase === 'SETTLED') break;
      await page.keyboard.press(phase === 'INSURANCE' ? 'n' : 's');
      await page.keyboard.press('Escape');
      await settle(page);
    }
    await expect(page.getByTestId('table')).toHaveAttribute('data-phase', 'SETTLED');
  });

  test('with reduced motion the round still unfolds card by card (only without movement)', async ({
    browser,
  }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    // No saved settings: the default speed is "normal" for everyone.
    await page.goto('/register');
    await page.fill('input[name=email]', `e2e-rm-${Date.now()}@test.local`);
    await page.fill('input[name=displayName]', 'Calm');
    await page.fill('input[name=password]', 'una clave larga');
    await page.click('button[type=submit]');
    await page.waitForURL('**/account');
    await page.goto('/blackjack');
    await page.getByTestId('deal').click();
    await expect(page.getByTestId('table')).toHaveAttribute('data-animating', 'true');
    await page.waitForTimeout(400);
    expect(await page.getByTestId('table-card').count()).toBeLessThan(4);
    await settle(page);
    expect(await page.getByTestId('table-card').count()).toBeGreaterThanOrEqual(4);
    await context.close();
  });

  test('"Sin animación" shows the outcome at once', async ({ page }) => {
    await signUpAndOpenTable(page, { speed: 'instant' });
    const started = Date.now();
    await clickAndSettle(page, page.getByTestId('deal'));
    expect(Date.now() - started).toBeLessThan(1500);
    expect(await page.getByTestId('table-card').count()).toBeGreaterThanOrEqual(4);
  });

  test('at normal speed a dealt card shows its value only once it has landed', async ({ page }) => {
    await signUpAndOpenTable(page, { speed: 'normal' });
    await page.getByTestId('deal').click();
    // The first card is in flight face down: no value on the page and no total yet.
    await expect(page.getByTestId('table-card').first()).toBeAttached();
    await page.waitForTimeout(250);
    await expect(page.getByTestId('total-0')).toHaveCount(0);
    await settle(page);
    await expect(page.getByTestId('total-0')).toHaveCount(1);
  });

  test('settings persist across reloads', async ({ page }) => {
    await signUpAndOpenTable(page, { speed: 'fast', sound: true });
    await page.getByRole('button', { name: /Sonido/ }).click();
    await page.getByRole('checkbox', { name: 'Crupier' }).uncheck();
    await page.reload();
    await expect(page.getByRole('button', { name: /Silencio/ })).toBeVisible();
    await expect(page.getByTestId('dealer')).toHaveCount(0);
  });
});

test.describe('performance', () => {
  test('the deal animation stays smooth and the table is light', async ({ page }) => {
    // Sound on: the worst case (creating the AudioContext used to stall the first frame).
    await signUpAndOpenTable(page, { speed: 'normal', sound: true });
    await page.waitForTimeout(3500); // idle time for the audio warm-up

    const bytes = await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .concat(performance.getEntriesByType('navigation'))
        .reduce((sum, e) => sum + ((e as PerformanceResourceTiming).transferSize || 0), 0),
    );
    expect(bytes).toBeLessThan(1.5 * 1024 * 1024);

    // Record frame times while the initial deal animates.
    await page.evaluate(() => {
      const w = window as unknown as { __frames: number[] };
      w.__frames = [];
      let last = performance.now();
      const loop = (t: number) => {
        w.__frames.push(t - last);
        last = t;
        if (w.__frames.length < 150) requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    await page.getByTestId('deal').click();
    await page.waitForTimeout(2600);
    const frames = await page.evaluate(() =>
      (window as unknown as { __frames: number[] }).__frames.slice(5),
    );
    const slow = frames.filter((f) => f > 32).length;
    // A frame over 32 ms is a visible stutter. One is tolerated for CI noise (GC).
    expect(slow).toBeLessThanOrEqual(1);
  });
});
