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
    heading: /Choose your world/i,
  },
  {
    name: 'generated-world',
    region: '.setup-panel',
    heading: /Choose your world/i,
  },
  {
    name: 'generate-world-busy',
    region: '.setup-panel',
    heading: /Choose your world/i,
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
    name: 'human-vs-bot-setup',
    region: '.pregame-panel',
    heading: /Preview and assign territories/i,
  },
  {
    name: 'multiple-bot-setup',
    region: '.pregame-panel',
    heading: /Preview and assign territories/i,
  },
  {
    name: 'pregame-six-seats',
    region: '.pregame-panel',
    heading: /Preview and assign territories/i,
  },
  {
    name: 'draft-started',
    region: '.pregame-panel',
    heading: /chooses now/i,
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
  {
    name: 'reroll-busy',
    region: '.pregame-panel',
    heading: /Preview and assign territories/i,
  },
  { name: 'handoff', region: '.handoff-card', heading: /Pass the device/i },
  { name: 'reinforcement', region: '.hud', heading: /Crimson League/i },
  {
    name: 'multiplayer-authority',
    region: '.hud',
    heading: /Authoritative revision 12/i,
  },
  { name: 'bot-turn', region: '.hud', heading: /is acting/i },
  { name: 'bot-reinforcement', region: '.hud', heading: /is acting/i },
  { name: 'human-after-bot', region: '.hud', heading: /Crimson League/i },
  { name: 'bot-victory', region: '.hud', heading: /Match won/i },
  { name: 'attack-source', region: '.hud', heading: /Crimson League/i },
  { name: 'attack-target', region: '.hud', heading: /Crimson League/i },
  {
    name: 'attack-confirmation',
    region: '.hud',
    heading: /End attacking now/i,
  },
  { name: 'combat-result', region: '.hud', heading: /Crimson League/i },
  { name: 'pending-capture', region: '.hud', heading: /Move armies in/i },
  {
    name: 'pending-capture-fixed',
    region: '.hud',
    heading: /Move armies in/i,
  },
  {
    name: 'player-elimination',
    region: '.activity-panel',
    heading: /Activity/i,
  },
  { name: 'fortification', region: '.hud', heading: /Crimson League/i },
  {
    name: 'fortification-fixed',
    region: '.hud',
    heading: /Crimson League/i,
  },
  { name: 'game-over', region: '.hud', heading: /Match won/i },
  { name: 'navigator', region: '.hud', heading: /Crimson League/i },
  { name: 'event-log', region: '.activity-panel', heading: /Activity/i },
  {
    name: 'saved-resume',
    region: '.setup-panel',
    heading: /Local session available/i,
  },
  {
    name: 'minimap-seam',
    region: '.minimap-panel',
    heading: /World minimap/i,
  },
  {
    name: 'minimap-focus-east',
    region: '.minimap-panel',
    heading: /World minimap/i,
  },
  {
    name: 'minimap-focus-north',
    region: '.minimap-panel',
    heading: /World minimap/i,
  },
  {
    name: 'minimap-focus-west',
    region: '.minimap-panel',
    heading: /World minimap/i,
  },
];

for (const scenario of scenarios) {
  test(`visual review: ${scenario.name}`, async ({ page }, testInfo) => {
    await openScenario(page, scenario.name);
    if (scenario.name === 'navigator') {
      await page.getByRole('button', { name: /Territory list/i }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
    }
    if (scenario.name === 'attack-confirmation') {
      await page.getByRole('button', { name: 'End attack phase' }).click();
    }
    if (scenario.name === 'event-log') {
      await page.locator('.event-log ol').evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
    }
    if (scenario.name === 'player-elimination') {
      await page.locator('.event-log ol').evaluate((element) => {
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
    if (scenario.name.startsWith('minimap-focus-')) {
      await page.waitForFunction(() => {
        const longitude = Number(
          document
            .querySelector('.minimap-focus')
            ?.getAttribute('data-longitude'),
        );
        return Number.isFinite(longitude) && Math.abs(longitude - 90) > 15;
      });
    }

    await expect(page.getByText(scenario.heading).first()).toBeVisible();
    const region =
      scenario.name === 'navigator'
        ? page.getByRole('dialog')
        : page.locator(scenario.region);
    await expect(region).toHaveScreenshot(
      `${scenario.name}-ui.png`,
      scenario.name.startsWith('minimap-focus-')
        ? { maxDiffPixelRatio: 0 }
        : undefined,
    );
    await page.screenshot({
      path: reviewPath(testInfo, scenario.name),
      fullPage: true,
      animations: 'disabled',
    });
  });
}

for (const fixture of [
  'empty',
  'running',
  'passed',
  'failed',
  'interrupted',
  'simulation-heavy',
] as const) {
  test(`visual review: admin-${fixture}`, async ({ page }, testInfo) => {
    const source = fixture === 'simulation-heavy' ? 'passed' : fixture;
    await page.goto(`/admin?admin-fixture=${source}`);
    await page.addStyleTag({
      content: ':root { font-family: Arial, sans-serif !important; }',
    });
    await expect(
      page.getByRole('heading', { name: 'Verification Dashboard' }),
    ).toBeVisible();
    if (fixture === 'empty')
      await expect(
        page.getByRole('heading', { name: 'No report available' }),
      ).toBeVisible();
    else
      await expect(page.getByRole('heading', { name: 'Suites' })).toBeVisible();
    await expect(page.locator('.admin-shell')).toHaveScreenshot(
      `admin-${fixture}-ui.png`,
    );
    await page.screenshot({
      path: reviewPath(testInfo, `admin-${fixture}`),
      fullPage: true,
    });
  });
}

for (const fixture of [
  'study-running',
  'study-warning',
  'study-failed',
  'study-interrupted',
] as const) {
  test(`visual review: admin-${fixture}`, async ({ page }, testInfo) => {
    const source = fixture.replace('study-', '');
    await page.goto(`/admin?admin-fixture=${source}`);
    await page.addStyleTag({
      content: ':root { font-family: Arial, sans-serif !important; }',
    });
    await expect(
      page.getByRole('heading', { name: 'Balance Studies' }),
    ).toBeVisible();
    await expect(page.locator('.study-overview')).toBeVisible();
    await expect(page.locator('.study-section')).toHaveScreenshot(
      `admin-${fixture}-ui.png`,
    );
    await page.screenshot({
      path: reviewPath(testInfo, `admin-${fixture}`),
      fullPage: true,
    });
  });
}
