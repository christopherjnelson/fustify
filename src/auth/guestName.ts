const GENERATED_GUEST_NAME = /^[A-Z][a-z]+[A-Z][a-z]+-[0-9]{3}$/u;

export function isGeneratedGuestDisplayName(value: string): boolean {
  return GENERATED_GUEST_NAME.test(value);
}

export function profileInitials(displayName: string): string {
  const words = displayName
    .replace(/-[0-9]{3}$/u, '')
    .split(/(?=[A-Z])|[\s_-]+/u)
    .filter(Boolean);
  return words
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join('');
}
