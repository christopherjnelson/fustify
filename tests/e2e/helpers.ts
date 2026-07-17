import { expect, type Page, type TestInfo } from '@playwright/test';

export type Scenario =
  | 'world-setup'
  | 'pregame'
  | 'handoff'
  | 'reinforcement'
  | 'attack-source'
  | 'attack-target'
  | 'combat-result'
  | 'pending-capture'
  | 'player-elimination'
  | 'fortification'
  | 'game-over'
  | 'navigator'
  | 'event-log'
  | 'saved-resume';

export async function openScenario(page: Page, scenario: Scenario) {
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
  await page.goto(
    '/?v=1&seed=visual-review-atlas&territories=42&continents=6&players=4&visual-review=1',
  );
  await page.waitForFunction(() => window.__WORLDSEED_VISUAL__ !== undefined);
  await page.evaluate((name) => {
    window.__WORLDSEED_VISUAL__!.loadScenario(name);
  }, scenario);
  await page.addStyleTag({
    content: ':root { font-family: Arial, sans-serif !important; }',
  });
  await expect(page.locator('.app-shell')).toHaveClass(
    new RegExp(`mode-(world-setup|pregame|handoff|playing|game-over)`),
  );
  await page.locator('canvas').waitFor({ state: 'attached' });
  await page.waitForTimeout(150);
}

export function reviewPath(testInfo: TestInfo, scenario: string) {
  return `test-results/ui-review/${testInfo.project.name}/${scenario}.png`;
}

export async function stateSnapshot(page: Page) {
  return page.evaluate(() => window.__WORLDSEED_VISUAL__!.getState());
}
