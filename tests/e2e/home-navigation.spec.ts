import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

async function capture(
  page: import('@playwright/test').Page,
  projectName: string,
  name: string,
) {
  const path = `test-results/ui-review/${projectName}/${name}.png`;
  mkdirSync(dirname(path), { recursive: true });
  await page.screenshot({ path, fullPage: true });
}

test('home choices route through the account-required shell without loading gameplay', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Fustify' })).toBeVisible();
  const homeLogo = page
    .getByRole('link', { name: 'Fustify home' })
    .locator('.fustify-logo');
  await expect(homeLogo).toBeVisible();
  await expect(homeLogo).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('.hero-orbit')).toHaveCount(0);
  await expect(page.getByText(/procedural sphere|seed locked/i)).toHaveCount(0);
  await expect(page.locator('.home-shell')).toHaveCSS(
    'background-color',
    'rgb(5, 10, 18)',
  );
  await expect(page.locator('#home-title')).toHaveCSS(
    'font-family',
    /Orbitron/,
  );
  await expect(
    page.getByText(
      'A strategy game played across procedurally generated spherical worlds.',
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Single Player' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Multiplayer' }),
  ).toBeVisible();
  const singlePlayerAction = page.getByRole('link', {
    name: 'Play Single Player',
  });
  await expect(singlePlayerAction).toBeVisible();
  await expect(singlePlayerAction).toContainText('Play Single Player');
  await expect(singlePlayerAction.locator('[aria-hidden="true"]')).toHaveText(
    '→',
  );
  const actionPresentation = await singlePlayerAction.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      color: style.color,
      background: style.backgroundColor,
      overflow: style.overflow,
      width: rect.width,
      scrollWidth: element.scrollWidth,
    };
  });
  expect(actionPresentation.color).toBe('rgb(5, 10, 18)');
  expect(actionPresentation.background).toBe('rgb(204, 255, 0)');
  expect(actionPresentation.overflow).not.toBe('hidden');
  expect(actionPresentation.scrollWidth).toBeLessThanOrEqual(
    actionPresentation.width + 1,
  );
  await expect(
    page.getByRole('link', { name: 'Play Multiplayer' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Every world is different' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'How a match works' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Current features' }),
  ).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: /rankings|leaderboards|admin/i }),
  ).toHaveCount(0);
  expect(
    await page.locator('a a, a button, button a, button button').count(),
  ).toBe(0);
  expect(
    await page
      .locator('main h1')
      .evaluateAll((headings) =>
        headings.map((heading) => heading.textContent),
      ),
  ).toEqual(['Fustify']);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await capture(page, testInfo.project.name, 'homepage-signed-out');
  expect(
    await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter(
          (name) =>
            name.includes('/app/App') ||
            name.includes('MultiplayerApp') ||
            name.includes('three'),
        ),
    ),
  ).toEqual([]);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('[class*="hero-orbit"]')).toHaveCount(0);

  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Fustify home' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Account' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'Play Single Player' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/local$/);
  await expect(
    page.getByRole('heading', { name: 'Account required' }),
  ).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Sign in' })).toBeVisible();
  await capture(
    page,
    testInfo.project.name,
    'homepage-single-player-auth-gate',
  );
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Account required' }),
  ).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole('link', { name: 'Play Multiplayer' }).click();
  await expect(page).toHaveURL(/\/multiplayer$/);
  await expect(
    page.getByRole('heading', {
      name: /^(Account required|Multiplayer configuration unavailable)$/,
    }),
  ).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Sign in' })).toBeVisible();
  await capture(page, testInfo.project.name, 'homepage-multiplayer-auth-gate');

  await page.goto(
    '/?v=1&seed=legacy-atlas&territories=42&continents=5&players=4&assignment=random#setup',
  );
  await expect(
    page.getByRole('heading', { name: 'Account required' }),
  ).toBeVisible();
  await expect(page).toHaveURL(/assignment=random#setup$/);
  await expect(
    page.getByRole('heading', { name: 'Single Player' }),
  ).toHaveCount(0);
});
