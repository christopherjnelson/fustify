export const DEFAULT_FUSTIFY_API_PORT = 8787;

export function resolveFustifyApiPort(value: string | undefined): number {
  const port = Number(value ?? DEFAULT_FUSTIFY_API_PORT);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error('FUSTIFY_API_PORT must be an integer from 1 to 65535.');
  }
  return port;
}

export function fustifyApiOrigin(port: number): string {
  return `http://127.0.0.1:${port.toString()}`;
}
