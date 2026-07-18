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
    heading: /Preview and assign territories/i,
  },
  {
    name: 'pregame-random-ready',
    region: '.pregame-panel',
    heading: /Preview and assign territories/i,
  },
  {
    name: 'draft-in-progress',
    region: '.pregame-panel',
    heading: /chooses now/i,
  },
  {
    name: 'draft-complete',
    region: '.pregame-panel',
    heading: /Preview and assign territories/i,
  },
  {
    name: 'draft-invalid',
    region: '.pregame-panel',
    heading: /chooses now/i,
  },
  {
    name: 'pregame-poor',
    region: '.pregame-panel',
    heading: /Preview and assign territories/i,
  },
  {
    name: 'pregame-invalid',
    region: '.pregame-panel',
    heading: /Preview and assign territories/i,
  },
  {
    name: 'pregame-expanded',
    region: '.pregame-panel',
    heading: /Preview and assign territories/i,
  },
  {
    name: 'pregame-rerolled',
    region: '.pregame-panel',
    heading: /Preview and assign territories/i,
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
    heading: /Local session available/i,
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
    if (scenario.name === 'pregame-expanded') {
      await page.getByText('How is this scored?').click();
      await page.locator('.pregame-panel').evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
    }
    if (
      scenario.name === 'draft-complete' ||
      scenario.name === 'draft-invalid'
    ) {
      await page.locator('.pregame-panel').evaluate((element) => {
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
