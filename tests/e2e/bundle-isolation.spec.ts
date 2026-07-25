import { expect, test, type Page } from '@playwright/test';

// Browser-level proof that route code splitting actually holds. The manifest
// tests in src/build/bundleBudget.test.ts prove the static graph; this proves
// what Chromium really fetches. The dev server serves unbundled modules, so a
// leaked import shows up as a concrete request for the offending module or its
// prebundled dependency.

/** Module fingerprints that must never load before the user opts into a route. */
const GAMEPLAY_FINGERPRINTS = [
  '/deps/three',
  'three.js',
  '@react-three',
  'react-three',
  'GlobeScene',
  'Planet.tsx',
  'CameraController',
  'GameSetup',
  'PregamePanel',
  'WorldSetupPanel',
  'gameReducer',
  'generatePlanet',
  'useGameStore',
  'core/simulation',
  'matchSynchronization',
];

const ADMIN_FINGERPRINTS = ['AdminDashboard', 'reportSource', 'reportFixtures'];
const MULTIPLAYER_FINGERPRINTS = ['MultiplayerApp', 'multiplayerApi'];
const LOCAL_GAME_FINGERPRINTS = ['app/App.tsx', 'useBotTurnRunner'];
const TEST_ONLY_FINGERPRINTS = ['visualScenarios', 'testFixtures'];

function recordRequests(page: Page): string[] {
  const requested: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.startsWith('http://127.0.0.1')) requested.push(url);
  });
  return requested;
}

function matching(requested: string[], fingerprints: string[]): string[] {
  return requested.filter((url) =>
    fingerprints.some((fingerprint) => url.includes(fingerprint)),
  );
}

function expectAbsent(
  requested: string[],
  fingerprints: string[],
  label: string,
) {
  expect(
    matching(requested, fingerprints),
    `${label} must not be downloaded`,
  ).toEqual([]);
}

async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
}

test.describe('route chunk isolation', () => {
  test('a signed-out visit to / downloads no gameplay, admin, or test-only code', async ({
    page,
  }) => {
    const requested = recordRequests(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Fustify' })).toBeVisible();
    await settle(page);

    expect(requested.length).toBeGreaterThan(0);
    expectAbsent(requested, GAMEPLAY_FINGERPRINTS, 'gameplay code');
    expectAbsent(requested, ADMIN_FINGERPRINTS, 'admin code');
    expectAbsent(requested, MULTIPLAYER_FINGERPRINTS, 'multiplayer code');
    expectAbsent(requested, LOCAL_GAME_FINGERPRINTS, 'local game code');
    expectAbsent(requested, TEST_ONLY_FINGERPRINTS, 'test-only code');
  });

  test('the signed-out account gate on /local downloads no gameplay code', async ({
    page,
  }) => {
    const requested = recordRequests(page);
    await page.goto('/local');
    await expect(
      page.getByRole('heading', { name: /sign in|account/i }).first(),
    ).toBeVisible();
    await settle(page);

    expectAbsent(requested, GAMEPLAY_FINGERPRINTS, 'gameplay code');
    expectAbsent(requested, ADMIN_FINGERPRINTS, 'admin code');
    expectAbsent(requested, MULTIPLAYER_FINGERPRINTS, 'multiplayer code');
  });

  test('the signed-out account gate on /multiplayer downloads no gameplay code', async ({
    page,
  }) => {
    const requested = recordRequests(page);
    await page.goto('/multiplayer');
    await expect(
      page.getByRole('heading', { name: /sign in|account/i }).first(),
    ).toBeVisible();
    await settle(page);

    expectAbsent(requested, GAMEPLAY_FINGERPRINTS, 'gameplay code');
    expectAbsent(requested, ADMIN_FINGERPRINTS, 'admin code');
    expectAbsent(requested, LOCAL_GAME_FINGERPRINTS, 'local game code');
  });

  test('/admin loads no gameplay, auth shell, or multiplayer code', async ({
    page,
  }) => {
    const requested = recordRequests(page);
    await page.goto('/admin');
    await expect(page.locator('.admin-shell, main').first()).toBeVisible();
    await settle(page);

    expectAbsent(requested, GAMEPLAY_FINGERPRINTS, 'gameplay code');
    expectAbsent(requested, MULTIPLAYER_FINGERPRINTS, 'multiplayer code');
    expectAbsent(requested, LOCAL_GAME_FINGERPRINTS, 'local game code');
    expect(
      matching(requested, ['BrowserApp', 'home/Home']),
      'admin must not load the public browser shell',
    ).toEqual([]);
  });

  test('/auth/callback loads no gameplay or browser shell code', async ({
    page,
  }) => {
    const requested = recordRequests(page);
    await page.goto('/auth/callback');
    await settle(page);

    expectAbsent(requested, GAMEPLAY_FINGERPRINTS, 'gameplay code');
    expectAbsent(requested, ADMIN_FINGERPRINTS, 'admin code');
    expect(
      matching(requested, ['BrowserApp', 'home/Home']),
      'the auth callback must not load the public browser shell',
    ).toEqual([]);
  });

  // Positive control. Without this, a typo in GAMEPLAY_FINGERPRINTS would make
  // every isolation assertion above pass vacuously.
  test('a route that does render the globe really does download gameplay code', async ({
    page,
  }) => {
    const requested = recordRequests(page);
    await page.goto(
      '/?v=1&seed=visual-review-atlas&territories=42&continents=6&players=4&visual-review=1',
    );
    await page.locator('.app-shell').waitFor({ state: 'attached' });
    await settle(page);

    expect(
      matching(requested, ['/deps/three', 'three.js']).length,
    ).toBeGreaterThan(0);
    expect(matching(requested, ['GlobeScene']).length).toBeGreaterThan(0);
    expect(matching(requested, ['app/App.tsx']).length).toBeGreaterThan(0);
    expect(matching(requested, ['generatePlanet']).length).toBeGreaterThan(0);
  });
});
