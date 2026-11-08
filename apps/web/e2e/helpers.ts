import { expect, type Locator, type Page } from '@playwright/test';

export const API = 'http://localhost:4000';

/** Registers a fresh player through the UI and lands on the blackjack table. */
export async function signUpAndOpenTable(
  page: Page,
  settings: { speed?: 'normal' | 'fast' | 'instant'; sound?: boolean } = {},
) {
  await page.addInitScript((s) => {
    try {
      // Initial settings only: later reloads must keep what the test changed.
      if (window.localStorage.getItem('casino.settings.v2')) return;
      window.localStorage.setItem(
        'casino.settings.v2',
        JSON.stringify({
          sound: s.sound ?? false,
          volume: 0.5,
          speed: s.speed ?? 'fast',
          showDealer: true,
        }),
      );
    } catch {
      // ignore
    }
  }, settings);
  await page.goto('/register');
  await page.fill(
    'input[name=email]',
    `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`,
  );
  await page.fill('input[name=displayName]', 'E2E');
  await page.fill('input[name=password]', 'una clave larga');
  await page.click('button[type=submit]');
  await page.waitForURL('**/account');
  await page.goto('/blackjack');
  await expect(page.getByTestId('deal')).toBeVisible();
}

/** Waits until no request is in flight and no animation is running. */
export async function settle(page: Page) {
  await expect(page.getByTestId('table')).toHaveAttribute('data-busy', 'false');
}

/**
 * Clicks something that talks to the server and waits for its response to be fully shown:
 * the round version must change (a click is not enough: the request may not have started).
 */
export async function clickAndSettle(page: Page, target: Locator) {
  const table = page.getByTestId('table');
  const before = await table.getAttribute('data-version');
  await target.click();
  await expect(table).not.toHaveAttribute('data-version', before ?? '');
  await settle(page);
}

/** Plays the round on screen until it is over (declines insurance, stands). */
export async function playToEnd(page: Page) {
  for (let i = 0; i < 12; i++) {
    await settle(page);
    const phase = await page.getByTestId('table').getAttribute('data-phase');
    if (phase === 'SETTLED') return;
    if (phase === 'INSURANCE') {
      await clickAndSettle(page, page.getByRole('button', { name: /Sin seguro/ }));
    } else {
      await clickAndSettle(page, page.getByTestId('action-STAND'));
    }
  }
  throw new Error('round did not finish');
}

/** The round as the API sees it, fetched with the browser's own session cookie. */
export async function serverRound(page: Page, roundId: string) {
  const refreshed = await page.request.post(`${API}/auth/refresh`);
  expect(refreshed.ok()).toBe(true);
  const { accessToken } = (await refreshed.json()) as { accessToken: string };
  const res = await page.request.get(`${API}/blackjack/rounds/${roundId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(res.ok()).toBe(true);
  return (await res.json()) as {
    view: {
      phase: string;
      dealer: { cards: Array<string | null> };
      hands: Array<{ cards: string[]; result: string | null }>;
    };
    events: Array<{ type: string; payload: { card?: string } }>;
    balance: string;
  };
}

/** Cards as shown on the table (face-down cards have no data-card). */
export async function shownCards(page: Page) {
  const dealer = await page
    .getByTestId('dealer-cards')
    .getByTestId('table-card')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-card')));
  const hands = await page
    .locator('[data-testid^="hand-"]:not([data-testid^="hand-result"])')
    .evaluateAll((els) =>
      els.map((h) => ({
        cards: Array.from(h.querySelectorAll('[data-testid="table-card"]')).map((c) =>
          c.getAttribute('data-card'),
        ),
        result:
          h.querySelector('[data-testid^="hand-result-"]')?.getAttribute('data-result') ?? null,
      })),
    );
  return { dealer, hands };
}
