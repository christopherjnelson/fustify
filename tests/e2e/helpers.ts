import { expect, type Page, type TestInfo } from '@playwright/test';

export type Scenario =
  | 'world-setup'
  | 'generated-world'
  | 'generate-world-busy'
  | 'pregame'
  | 'pregame-random-ready'
  | 'human-vs-bot-setup'
  | 'multiple-bot-setup'
  | 'pregame-six-seats'
  | 'draft-started'
  | 'draft-in-progress'
  | 'draft-complete'
  | 'draft-invalid'
  | 'pregame-poor'
  | 'pregame-invalid'
  | 'pregame-expanded'
  | 'pregame-rerolled'
  | 'reroll-busy'
  | 'handoff'
  | 'reinforcement'
  | 'multiplayer-authority'
  | 'bot-turn'
  | 'bot-reinforcement'
  | 'human-after-bot'
  | 'bot-victory'
  | 'attack-source'
  | 'attack-target'
  | 'attack-confirmation'
  | 'attack-no-legal'
  | 'combat-result'
  | 'pending-capture'
  | 'pending-capture-fixed'
  | 'player-elimination'
  | 'fortification'
  | 'fortification-fixed'
  | 'game-over'
  | 'navigator'
  | 'event-log'
  | 'activity-dock'
  | 'saved-resume'
  | 'minimap-seam'
  | 'minimap-focus-east'
  | 'minimap-focus-north'
  | 'minimap-focus-west';

export async function openScenario(
  page: Page,
  scenario: Scenario,
  controls: 'collapsed' | 'expanded' = 'collapsed',
) {
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
  await page.addInitScript((initialControls) => {
    if (sessionStorage.getItem('fustify:visual-controls-initialized')) return;
    if (initialControls === 'collapsed') {
      sessionStorage.setItem('fustify:globe-controls-collapsed', 'true');
    } else {
      sessionStorage.removeItem('fustify:globe-controls-collapsed');
    }
    sessionStorage.setItem('fustify:visual-controls-initialized', 'true');
  }, controls);
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

export async function createPrivateMultiplayerGame(page: Page) {
  await page
    .getByRole('button', { name: 'Create Game', exact: true })
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: 'Create Game' });
  await dialog.getByLabel('Private').check();
  await dialog
    .getByRole('button', { name: 'Create Game', exact: true })
    .click();
}

export async function submitMultiplayerRoomCode(page: Page) {
  await page.getByLabel('Room code').press('Enter');
}

export async function stateSnapshot(page: Page) {
  return page.evaluate(() => window.__WORLDSEED_VISUAL__!.getState());
}
