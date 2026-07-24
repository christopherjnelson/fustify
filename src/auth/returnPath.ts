const ALLOWED_EXACT_PATHS = new Set(['/', '/local', '/multiplayer']);
const ALLOWED_PREFIXES = ['/multiplayer/room/', '/multiplayer/match/'];

function containsAsciiControl(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

export function validatedReturnPath(candidate: unknown): string {
  if (typeof candidate !== 'string' || candidate.length === 0) return '/';
  if (
    !candidate.startsWith('/') ||
    candidate.startsWith('//') ||
    candidate.includes('\\') ||
    containsAsciiControl(candidate)
  ) {
    return '/';
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate, 'https://fustify.invalid');
  } catch {
    return '/';
  }
  if (parsed.origin !== 'https://fustify.invalid') return '/';

  const path = parsed.pathname;
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(path);
  } catch {
    return '/';
  }
  if (decodedPath.includes('\\') || containsAsciiControl(decodedPath)) {
    return '/';
  }
  const allowed =
    ALLOWED_EXACT_PATHS.has(path) ||
    ALLOWED_PREFIXES.some(
      (prefix) =>
        path.startsWith(prefix) && path.slice(prefix.length).length > 0,
    );
  return allowed ? `${path}${parsed.search}${parsed.hash}` : '/';
}

export function currentSafeReturnPath(): string {
  return validatedReturnPath(
    `${window.location.pathname}${window.location.search}${window.location.hash}`,
  );
}
