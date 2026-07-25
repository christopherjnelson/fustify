import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  CURRENT_GENERATOR_VERSION,
  NORMALIZED_GENERATOR_VERSION,
} from '../../src/core/generation/constants';
import { analyzeContinentQuality } from '../../src/core/generation/continentQuality';
import { analyzePlanetGeometry } from '../../src/core/generation/geometryQuality';
import {
  NORMALIZED_WORLD_REVIEW_FIXTURES,
  type NormalizedWorldReviewFixture,
} from '../../src/core/generation/worldGenerationAuditFixtures';

const artifactRoot = path.resolve(
  '.fustify/reports/world-generation/normalized-v2/visual',
);

test.setTimeout(120_000);

function shouldRunFixture(
  fixture: NormalizedWorldReviewFixture,
  project: string,
): boolean {
  if (project === 'laptop-1366') return true;
  if (project === 'desktop-1920') return fixture.priority === 'all-desktop';
  return fixture.seed === 'atlas-prime';
}

async function openReviewHarness(page: Page) {
  await page.goto(
    '/?v=1&seed=normalized-review-loader&territories=42&continents=5&players=4&visual-review=1',
  );
  await page.waitForFunction(() => window.__WORLDSEED_VISUAL__ !== undefined);
  await page.locator('canvas').waitFor({ state: 'visible' });
}

async function loadWorld(
  page: Page,
  fixture: NormalizedWorldReviewFixture,
  generatorVersion: 3 | 4,
  view: 'continents' | 'ownership',
) {
  await page.evaluate(
    ({ fixture, generatorVersion, view }) =>
      window.__WORLDSEED_VISUAL__!.loadGeneratedWorld({
        seed: fixture.seed,
        territoryCount: fixture.territoryCount,
        continentCount: fixture.continentCount,
        generatorVersion,
        view,
      }),
    { fixture, generatorVersion, view },
  );
  await expect(page.locator('.app-shell')).toHaveClass(
    view === 'ownership' ? /mode-playing/ : /mode-world-setup/,
  );
  await page.waitForTimeout(80);
}

async function capture(
  page: Page,
  directory: string,
  name: string,
  fullPage = false,
) {
  await mkdir(directory, { recursive: true });
  if (fullPage) {
    await page.screenshot({
      path: path.join(directory, `${name}.png`),
      fullPage: true,
      animations: 'disabled',
    });
  } else {
    await page.locator('canvas').screenshot({
      path: path.join(directory, `${name}.png`),
      animations: 'disabled',
    });
  }
}

for (const fixture of NORMALIZED_WORLD_REVIEW_FIXTURES) {
  test(`normalized comparison: ${fixture.territoryCount}/${fixture.continentCount} ${fixture.seed}`, async ({
    page,
  }, testInfo) => {
    test.skip(!shouldRunFixture(fixture, testInfo.project.name));
    await openReviewHarness(page);
    const reports = [];
    for (const [profile, generatorVersion] of [
      ['v1-current', CURRENT_GENERATOR_VERSION],
      ['v2-normalized', NORMALIZED_GENERATOR_VERSION],
    ] as const) {
      const output = path.join(
        artifactRoot,
        testInfo.project.name,
        fixture.seed,
        profile,
      );
      await loadWorld(page, fixture, generatorVersion, 'continents');
      const state = await page.evaluate(() =>
        window.__WORLDSEED_VISUAL__!.getState(),
      );
      expect(state.planet.generatorVersion).toBe(generatorVersion);
      expect(state.planet.territories).toHaveLength(fixture.territoryCount);
      expect(state.planet.continents).toHaveLength(fixture.continentCount);
      expect(
        state.planet.connections.filter(
          (connection) => connection.type === 'sea-route',
        ).length,
      ).toBeGreaterThan(0);
      await page.evaluate(() =>
        window.__WORLDSEED_VISUAL__!.orientGlobe(0, 12, 5.2),
      );
      await capture(page, output, 'continents-globe-0');
      await page.locator('[data-testid="minimap"]').screenshot({
        path: path.join(output, 'continents-minimap.png'),
        animations: 'disabled',
      });

      if (testInfo.project.name !== 'mobile-390') {
        await page.evaluate(() =>
          window.__WORLDSEED_VISUAL__!.orientGlobe(180, 12, 5.2),
        );
        await capture(page, output, 'continents-globe-180');
        await loadWorld(page, fixture, generatorVersion, 'ownership');
        await page.evaluate(() =>
          window.__WORLDSEED_VISUAL__!.orientGlobe(90, 12, 5.2),
        );
        await capture(page, output, 'ownership-globe-90');
        await page.locator('[data-testid="minimap"]').screenshot({
          path: path.join(output, 'ownership-minimap.png'),
          animations: 'disabled',
        });
        const focusId = state.planet.territories[0]!.id;
        await page.evaluate((territoryId) => {
          window.__WORLDSEED_VISUAL__!.focusTerritory(territoryId);
        }, focusId);
        await expect
          .poll(async () => {
            const focused = await page.evaluate(() =>
              window.__WORLDSEED_VISUAL__!.getState(),
            );
            return focused.focusTargetTerritoryId;
          })
          .toBe(focusId);
        await capture(page, output, 'ownership-focused');
      }
      await capture(page, output, 'full-page', true);

      const geometry = analyzePlanetGeometry(state.planet);
      const continents = analyzeContinentQuality(state.planet);
      reports.push({ profile, geometry, continents });
      await writeFile(
        path.join(output, 'metrics.json'),
        `${JSON.stringify(
          {
            fixture,
            profile,
            generatorVersion,
            geometry,
            continents,
            generationDiagnostics: state.planet.generationDiagnostics,
          },
          null,
          2,
        )}\n`,
      );
    }
    const comparisonOutput = path.join(
      artifactRoot,
      testInfo.project.name,
      fixture.seed,
    );
    await writeFile(
      path.join(comparisonOutput, 'comparison.json'),
      `${JSON.stringify({ fixture, reports }, null, 2)}\n`,
    );
  });
}

test('normalized canonical mesh raycasts the rendered ownership surface', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'laptop-1366');
  await openReviewHarness(page);
  await loadWorld(
    page,
    NORMALIZED_WORLD_REVIEW_FIXTURES[0]!,
    NORMALIZED_GENERATOR_VERSION,
    'ownership',
  );
  const targetId = await page.evaluate(() => {
    const state = window.__WORLDSEED_VISUAL__!.getState();
    const territoryId = state.planet.territories[0]!.id;
    window.__WORLDSEED_VISUAL__!.focusTerritory(territoryId);
    return territoryId;
  });
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.__WORLDSEED_VISUAL__!.getState()))
          .focusTargetTerritoryId,
    )
    .toBe(targetId);
  await page.waitForTimeout(1_200);
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  let hovered: string | null = null;
  for (const xFraction of [0.5, 0.55, 0.6, 0.65, 0.7]) {
    for (const yFraction of [0.3, 0.4, 0.5, 0.6, 0.7]) {
      await page.mouse.move(
        box!.x + box!.width * xFraction,
        box!.y + box!.height * yFraction,
      );
      await page.waitForTimeout(30);
      hovered = await page.evaluate(
        () => window.__WORLDSEED_VISUAL__!.getState().hoveredTerritoryId,
      );
      if (hovered) break;
    }
    if (hovered) break;
  }
  expect(hovered).not.toBeNull();
  const state = await page.evaluate(() =>
    window.__WORLDSEED_VISUAL__!.getState(),
  );
  expect(
    state.planet.territories.some((territory) => territory.id === hovered),
  ).toBe(true);
  expect(
    state.planet.generationDiagnostics?.territoryMetrics.find(
      (territory) => territory.territoryId === hovered,
    )?.anchorInside,
  ).toBe(true);
});

test('explicit and unmarked normalized URLs both preview v2', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'laptop-1366');
  await page.goto(
    '/?v=1&generator=v2-normalized&seed=normalized-url-preview&territories=42&continents=5&players=4&visual-review=1',
  );
  await page.waitForFunction(() => window.__WORLDSEED_VISUAL__ !== undefined);
  expect(
    (await page.evaluate(() => window.__WORLDSEED_VISUAL__!.getState())).planet
      .generatorVersion,
  ).toBe(NORMALIZED_GENERATOR_VERSION);
  await page.goto(
    '/?v=1&seed=normalized-url-preview&territories=42&continents=5&players=4&visual-review=1',
  );
  await page.waitForFunction(() => window.__WORLDSEED_VISUAL__ !== undefined);
  expect(
    (await page.evaluate(() => window.__WORLDSEED_VISUAL__!.getState())).planet
      .generatorVersion,
  ).toBe(NORMALIZED_GENERATOR_VERSION);
});
