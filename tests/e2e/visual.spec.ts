import { expect, test } from '@playwright/test';
import { openScenario, reviewPath, type Scenario } from './helpers';

const scenarios: Array<{
  name: Scenario;
  region: string;
  heading: RegExp;
}> = [
  {
    name: 'world-setup',
    region: '.setup-panel',
    heading: /Configure your world/i,
  },
  {
    name: 'pregame',
    region: '.pregame-panel',
    heading: /Choose your factions/i,
  },
  { name: 'handoff', region: '.handoff-card', heading: /Pass the device/i },
  { name: 'reinforcement', region: '.hud', heading: /Crimson League/i },
  { name: 'attack-source', region: '.hud', heading: /Crimson League/i },
  { name: 'attack-target', region: '.hud', heading: /Crimson League/i },
  { name: 'combat-result', region: '.hud', heading: /Crimson League/i },
  { name: 'pending-capture', region: '.hud', heading: /Move armies in/i },
  { name: 'player-elimination', region: '.hud', heading: /Latest events/i },
  { name: 'fortification', region: '.hud', heading: /Crimson League/i },
  { name: 'game-over', region: '.hud', heading: /Match won/i },
  { name: 'navigator', region: '.hud', heading: /Crimson League/i },
  { name: 'event-log', region: '.hud', heading: /Latest events/i },
  {
    name: 'saved-resume',
    region: '.setup-panel',
    heading: /Local match available/i,
  },
];

for (const scenario of scenarios) {
  test(`visual review: ${scenario.name}`, async ({ page }, testInfo) => {
    await openScenario(page, scenario.name);
    if (scenario.name === 'navigator') {
      await page.getByRole('button', { name: /Territory list/i }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
    }
    if (scenario.name === 'event-log') {
      await page.locator('.hud').evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
    }
    if (scenario.name === 'player-elimination') {
      await page.locator('.hud').evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
    }

    await expect(page.getByText(scenario.heading).first()).toBeVisible();
    const region =
      scenario.name === 'navigator'
        ? page.getByRole('dialog')
        : page.locator(scenario.region);
    await expect(region).toHaveScreenshot(`${scenario.name}-ui.png`);
    await page.screenshot({
      path: reviewPath(testInfo, scenario.name),
      fullPage: true,
      animations: 'disabled',
    });
  });
}
