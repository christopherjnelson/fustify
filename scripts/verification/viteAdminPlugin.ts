import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import {
  isSafeRunId,
  verificationRunSchema,
} from '../../src/admin/reportContract';
import { reportPaths } from './reportStore';
import { balanceStudyReportSchema } from '../../src/admin/balanceStudyContract';
import { studyPaths } from '../balanceStudyStore';
import type { z } from 'zod';

function send(
  response: import('node:http').ServerResponse,
  status: number,
  body: unknown,
) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(body));
}

async function validatedFile(
  path: string,
  schema: z.ZodType = verificationRunSchema,
  label = 'verification report',
) {
  try {
    const value = JSON.parse(await readFile(path, 'utf8'));
    const parsed = schema.safeParse(value);
    return parsed.success
      ? { status: 200, body: parsed.data }
      : {
          status: 422,
          body: {
            error: `Invalid ${label}`,
            issues: parsed.error.issues.slice(0, 5).map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
            })),
          },
        };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === 'ENOENT'
      ? { status: 404, body: { error: 'Report not found' } }
      : { status: 422, body: { error: `Corrupt ${label}` } };
  }
}

export function fustifyAdminReportsPlugin(directory?: string): Plugin {
  const paths = reportPaths(directory);
  const studies = studyPaths(
    directory ? resolve(directory, 'studies') : undefined,
  );
  return {
    name: 'fustify-admin-reports',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url ?? '/', 'http://localhost');
        const studyPrefix = '/__fustify/admin/studies';
        if (url.pathname.startsWith(studyPrefix)) {
          if (request.method !== 'GET')
            return send(response, 405, { error: 'Read-only endpoint' });
          if (url.pathname === `${studyPrefix}/latest`) {
            const result = await validatedFile(
              studies.latest,
              balanceStudyReportSchema,
              'balance study report',
            );
            return send(response, result.status, result.body);
          }
          if (
            url.pathname === studyPrefix ||
            url.pathname === `${studyPrefix}/`
          ) {
            const limit = Math.min(
              50,
              Math.max(
                1,
                Number.parseInt(url.searchParams.get('limit') ?? '20', 10) ||
                  20,
              ),
            );
            let names: string[] = [];
            try {
              names = await readdir(studies.history);
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
                return send(response, 500, {
                  error: 'Unable to read study history',
                });
            }
            const reports = [];
            const errors = [];
            for (const name of names
              .filter((name) => name.endsWith('.json'))
              .sort()
              .reverse()
              .slice(0, limit)) {
              const result = await validatedFile(
                resolve(studies.history, name),
                balanceStudyReportSchema,
                'balance study report',
              );
              if (result.status === 200) reports.push(result.body);
              else
                errors.push({
                  id: name.slice(0, -5),
                  error: (result.body as { error: string }).error,
                });
            }
            reports.sort(
              (left, right) =>
                Date.parse((right as { startedAt: string }).startedAt) -
                Date.parse((left as { startedAt: string }).startedAt),
            );
            return send(response, 200, { reports, errors });
          }
          const encodedId = url.pathname.slice(studyPrefix.length + 1);
          let id: string;
          try {
            id = decodeURIComponent(encodedId);
          } catch {
            return send(response, 400, { error: 'Invalid run ID' });
          }
          if (!isSafeRunId(id))
            return send(response, 400, { error: 'Invalid run ID' });
          const result = await validatedFile(
            resolve(studies.history, `${id}.json`),
            balanceStudyReportSchema,
            'balance study report',
          );
          if (result.status === 404) {
            const latest = await validatedFile(
              studies.latest,
              balanceStudyReportSchema,
              'balance study report',
            );
            if (
              latest.status === 200 &&
              (latest.body as { id: string }).id === id
            )
              return send(response, 200, latest.body);
          }
          return send(response, result.status, result.body);
        }
        const prefix = '/__fustify/admin/reports';
        if (!url.pathname.startsWith(prefix)) return next();
        if (request.method !== 'GET')
          return send(response, 405, { error: 'Read-only endpoint' });
        if (url.pathname === `${prefix}/latest`) {
          const result = await validatedFile(paths.latest);
          return send(response, result.status, result.body);
        }
        if (url.pathname === prefix || url.pathname === `${prefix}/`) {
          const limit = Math.min(
            50,
            Math.max(
              1,
              Number.parseInt(url.searchParams.get('limit') ?? '20', 10) || 20,
            ),
          );
          let names: string[] = [];
          try {
            names = await readdir(paths.history);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
              return send(response, 500, {
                error: 'Unable to read report history',
              });
          }
          const reports = [];
          const errors = [];
          for (const name of names
            .filter((name) => name.endsWith('.json'))
            .sort()
            .reverse()
            .slice(0, limit)) {
            const result = await validatedFile(resolve(paths.history, name));
            if (result.status === 200) reports.push(result.body);
            else
              errors.push({
                id: name.slice(0, -5),
                error: (result.body as { error: string }).error,
              });
          }
          reports.sort(
            (left, right) =>
              Date.parse((right as { startedAt: string }).startedAt) -
              Date.parse((left as { startedAt: string }).startedAt),
          );
          return send(response, 200, { reports, errors });
        }
        const encodedId = url.pathname.slice(prefix.length + 1);
        let id: string;
        try {
          id = decodeURIComponent(encodedId);
        } catch {
          return send(response, 400, { error: 'Invalid run ID' });
        }
        if (!isSafeRunId(id))
          return send(response, 400, { error: 'Invalid run ID' });
        const result = await validatedFile(
          resolve(paths.history, `${id}.json`),
        );
        return send(response, result.status, result.body);
      });
    },
  };
}
