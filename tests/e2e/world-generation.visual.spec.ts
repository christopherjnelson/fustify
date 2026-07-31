import { expect, test, type Page } from '@playwright/test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { analyzeContinentQuality } from '../../src/core/generation/continentQuality';
import {
  CANONICAL_WORLD_CAMERA_ORIENTATIONS,
  WORLD_GENERATION_AUDIT_FIXTURES,
  type WorldGenerationAuditFixture,
} from '../../src/core/generation/worldGenerationAuditFixtures';

const phase = process.env.WORLD_AUDIT_PHASE ?? 'corrected';
const allowFailures = process.env.WORLD_AUDIT_ALLOW_FAILURES === '1';
const artifactRoot = path.resolve('.fustify/reports/world-generation', phase);

test.beforeAll(async (_fixtures, testInfo) => {
  if (testInfo.project.name !== 'desktop-1920') return;
  await rm(artifactRoot, { recursive: true, force: true });
  await mkdir(artifactRoot, { recursive: true });
});

async function openWorldThroughUi(
  page: Page,
  fixture: WorldGenerationAuditFixture,
) {
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
  await page.goto(
    '/?v=1&seed=world-audit-loader&territories=42&continents=6&players=4&visual-review=1',
  );
  await page.waitForFunction(() => window.__WORLDSEED_VISUAL__ !== undefined);
  await page.addStyleTag({
    content: ':root { font-family: Arial, sans-serif !important; }',
  });
  await page.getByLabel('Territory count').fill(String(fixture.territoryCount));
  await page.getByLabel('Continent count').fill(String(fixture.continentCount));
  await page.getByLabel('Planet seed').fill(fixture.seed);
  await page.getByLabel('Planet seed').press('Enter');
  await expect(page.locator('.seed-controls')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await expect(page.locator('.setup-heading')).toContainText(
    `Current seed: ${fixture.seed}`,
  );
  await expect(page.locator('.app-shell')).toHaveClass(/mode-world-setup/);
  await page.locator('canvas').waitFor({ state: 'attached' });
  await page.waitForTimeout(100);
}

async function captureWorld(
  page: Page,
  fixture: WorldGenerationAuditFixture,
  viewportName: string,
) {
  const output = path.join(artifactRoot, viewportName, fixture.seed);
  await mkdir(output, { recursive: true });
  await page.locator('[data-testid="minimap"]').screenshot({
    path: path.join(output, 'minimap.png'),
    animations: 'disabled',
  });
  for (const longitude of CANONICAL_WORLD_CAMERA_ORIENTATIONS) {
    await page.evaluate((value) => {
      window.__WORLDSEED_VISUAL__!.orientGlobe(value, 12, 5.2);
    }, longitude);
    const expectedLongitude =
      longitude === 270 ? -90 : longitude === 180 ? -180 : longitude;
    await expect(page.locator('.minimap-focus')).toHaveAttribute(
      'data-longitude',
      String(expectedLongitude),
    );
    await page.waitForTimeout(50);
    await page.locator('canvas').screenshot({
      path: path.join(output, `globe-${longitude}.png`),
      animations: 'disabled',
    });
  }
}

for (const fixture of WORLD_GENERATION_AUDIT_FIXTURES) {
  test(`world audit: ${fixture.territoryCount}/${fixture.continentCount} ${fixture.seed}`, async ({
    page,
  }, testInfo) => {
    const isLaptop = testInfo.project.name === 'laptop-1366';
    test.skip(
      !isLaptop && !fixture.responsive,
      'The full matrix runs at 1366×768 only.',
    );

    await openWorldThroughUi(page, fixture);
    const state = await page.evaluate(() =>
      window.__WORLDSEED_VISUAL__!.getState(),
    );
    const report = analyzeContinentQuality(state.planet);
    const output = path.join(artifactRoot, testInfo.project.name, fixture.seed);
    await mkdir(output, { recursive: true });
    await writeFile(
      path.join(output, 'metrics.json'),
      `${JSON.stringify({ fixture, report }, null, 2)}\n`,
    );

    expect(state.mode).toBe('world-setup');
    expect(state.setupPhase).toBe('neutral-preview');
    expect(state.planet.seed).toBe(fixture.seed);
    expect(state.planet.territories).toHaveLength(fixture.territoryCount);
    expect(state.planet.continents).toHaveLength(fixture.continentCount);
    await expect(page.locator('[data-testid="minimap"]')).toBeVisible();
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.locator('[role="alert"].error')).toHaveCount(0);
    const seaRouteCount = state.planet.connections.filter(
      (connection) => connection.type === 'sea-route',
    ).length;
    await expect(
      page.locator('[data-testid="globe-neutral-sea-routes"]'),
    ).toHaveAttribute('data-visible', 'true');
    await expect(
      page.locator('[data-testid="globe-neutral-sea-routes"]'),
    ).toHaveAttribute('data-route-count', String(seaRouteCount));

    const minimapAssignments = await page
      .locator('.minimap-territories path')
      .evaluateAll((paths) =>
        paths.map((element) => ({
          territoryId: element.getAttribute('data-territory-id'),
          continentId: element.getAttribute('data-continent-id'),
          fill: element.getAttribute('fill'),
        })),
      );
    expect(minimapAssignments).toHaveLength(state.planet.territories.length);
    const canonicalById = new Map(
      state.planet.territories.map((territory) => [territory.id, territory]),
    );
    for (const assignment of minimapAssignments) {
      const territory = canonicalById.get(assignment.territoryId!);
      expect(territory).toBeDefined();
      expect(assignment.continentId).toBe(territory!.continentId);
      expect(assignment.fill).toMatch(/^#[0-9a-f]{6}$/);
      expect(
        state.planet.surfaceCells.some(
          (cell) => cell.territoryId === assignment.territoryId,
        ),
      ).toBe(true);
    }

    await captureWorld(page, fixture, testInfo.project.name);
    if (fixture.responsive) {
      await page.screenshot({
        path: path.join(output, 'full-page.png'),
        fullPage: true,
        animations: 'disabled',
      });
    }

    if (!allowFailures) {
      expect(report.hardFailures, JSON.stringify(report, null, 2)).toEqual([]);
      expect(report.severeFailures, JSON.stringify(report, null, 2)).toEqual(
        [],
      );
    }
  });
}

test.describe('world-generation browser behavior', () => {
  test('direct URL and refresh reproduce corrected canonical geography', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'laptop-1366');
    const seed = 'calm-reef-648';
    await page.goto(
      `/?v=1&seed=${seed}&territories=42&continents=6&players=4&visual-review=1`,
    );
    await page.waitForFunction(() => window.__WORLDSEED_VISUAL__ !== undefined);
    const first = await page.evaluate(
      () => window.__WORLDSEED_VISUAL__!.getState().planet,
    );
    expect(first.seed).toBe(seed);
    await page.reload();
    await page.waitForFunction(() => window.__WORLDSEED_VISUAL__ !== undefined);
    const refreshed = await page.evaluate(
      () => window.__WORLDSEED_VISUAL__!.getState().planet,
    );
    expect(refreshed).toEqual(first);
  });

  test('repeated Generate World actions only present accepted candidates', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'laptop-1366');
    await page.goto(
      '/?v=1&seed=generate-audit&territories=42&continents=6&players=4&visual-review=1',
    );
    await page.waitForFunction(() => window.__WORLDSEED_VISUAL__ !== undefined);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await page.getByRole('button', { name: 'Generate World' }).click();
      await expect(page.locator('.seed-controls')).toHaveAttribute(
        'aria-busy',
        'false',
      );
      const planet = await page.evaluate(
        () => window.__WORLDSEED_VISUAL__!.getState().planet,
      );
      const report = analyzeContinentQuality(planet);
      if (!allowFailures) {
        expect(report.hardFailures, JSON.stringify(report, null, 2)).toEqual(
          [],
        );
        expect(report.severeFailures, JSON.stringify(report, null, 2)).toEqual(
          [],
        );
      }
    }
  });
});
