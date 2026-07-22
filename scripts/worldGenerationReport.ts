import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  severeContinentQualityFailures,
  type WorldContinentQualityReport,
} from '../src/core/generation/continentQuality';
import type { WorldGenerationAuditFixture } from '../src/core/generation/worldGenerationAuditFixtures';

interface StoredReport {
  fixture: WorldGenerationAuditFixture;
  report: WorldContinentQualityReport;
}

const phase = process.env.WORLD_AUDIT_PHASE ?? 'corrected';
const root = path.resolve('.fustify/reports/world-generation', phase);

async function findMetrics(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory()
        ? findMetrics(target)
        : Promise.resolve(entry.name === 'metrics.json' ? [target] : []);
    }),
  );
  return nested.flat();
}

const files = await findMetrics(root);
const reports = await Promise.all(
  files.map(async (file) => ({
    file,
    data: JSON.parse(await readFile(file, 'utf8')) as StoredReport,
  })),
);
for (const { data } of reports) {
  data.report.severeFailures = severeContinentQualityFailures(
    data.report.metrics,
  );
  data.report.category =
    data.report.hardFailures.length > 0
      ? 'hard-invalid'
      : data.report.severeFailures.length > 0
        ? 'severe-visual-quality'
        : 'acceptable-diversity';
}
const laptopReports = reports.filter(({ file }) =>
  file.includes('laptop-1366'),
);
const categoryCounts = laptopReports.reduce<Record<string, number>>(
  (counts, { data }) => {
    counts[data.report.category] = (counts[data.report.category] ?? 0) + 1;
    return counts;
  },
  {},
);
const groupSummary = Object.fromEntries(
  [...new Set(laptopReports.map(({ data }) => data.fixture.group))].map(
    (group) => {
      const selected = laptopReports.filter(
        ({ data }) => data.fixture.group === group,
      );
      return [
        group,
        {
          worlds: selected.length,
          hardInvalid: selected.filter(
            ({ data }) => data.report.category === 'hard-invalid',
          ).length,
          severeVisualQuality: selected.filter(
            ({ data }) => data.report.category === 'severe-visual-quality',
          ).length,
        },
      ];
    },
  ),
);
const summary = {
  phase,
  generatedAt: new Date().toISOString(),
  matrixWorldCount: laptopReports.length,
  categoryCounts,
  groupSummary,
  worlds: laptopReports.map(({ data }) => ({
    seed: data.fixture.seed,
    configuration: `${data.fixture.territoryCount}/${data.fixture.continentCount}`,
    group: data.fixture.group,
    category: data.report.category,
    hardFailures: data.report.hardFailures,
    severeFailures: data.report.severeFailures,
  })),
};
await writeFile(
  path.join(root, 'summary.json'),
  `${JSON.stringify(summary, null, 2)}\n`,
);

const rows = summary.worlds
  .map(
    (world) =>
      `<tr><td>${world.seed}</td><td>${world.configuration}</td><td>${world.group}</td><td>${world.category}</td><td>${[...world.hardFailures, ...world.severeFailures].join('<br>')}</td><td><a href="laptop-1366/${world.seed}/minimap.png">minimap</a> ${[0, 90, 180, 270].map((longitude) => `<a href="laptop-1366/${world.seed}/globe-${longitude}.png">${longitude}°</a>`).join(' ')}</td></tr>`,
  )
  .join('\n');
const html = `<!doctype html><meta charset="utf-8"><title>Fustify world generation ${phase}</title><style>body{font:14px system-ui;background:#07111f;color:#eef;padding:24px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #456;padding:8px;text-align:left;vertical-align:top}a{color:#7dd3fc}</style><h1>World generation audit: ${phase}</h1><pre>${JSON.stringify({ categoryCounts, groupSummary }, null, 2)}</pre><table><thead><tr><th>Seed</th><th>Config</th><th>Group</th><th>Category</th><th>Reasons</th><th>Captures</th></tr></thead><tbody>${rows}</tbody></table>`;
await writeFile(path.join(root, 'index.html'), html);
console.log(JSON.stringify(summary, null, 2));
