import { z } from 'zod';

function containsControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return (
      codePoint !== undefined &&
      (codePoint <= 31 || (codePoint >= 127 && codePoint <= 159))
    );
  });
}

export const profileDisplayNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .refine((value) => !containsControlCharacter(value));

export const profileAvatarUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    if (containsControlCharacter(value) || /\s/u.test(value)) return false;
    try {
      const url = new URL(value);
      return (
        url.protocol === 'https:' &&
        url.hostname.length > 0 &&
        url.username === '' &&
        url.password === ''
      );
    } catch {
      return false;
    }
  })
  .nullable();

export const profileRowSchema = z
  .object({
    user_id: z.uuid(),
    display_name: profileDisplayNameSchema,
    avatar_url: profileAvatarUrlSchema,
    created_at: z.iso.datetime({ offset: true }),
    updated_at: z.iso.datetime({ offset: true }),
  })
  .strict();

export type UserProfile = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export function parseUserProfile(value: unknown): UserProfile {
  const row = profileRowSchema.parse(value);
  return {
    userId: row.user_id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type ProfileUpdate = {
  displayName: string;
  avatarUrl: string | null;
};

export function parseProfileUpdate(value: ProfileUpdate): ProfileUpdate {
  return {
    displayName: profileDisplayNameSchema.parse(value.displayName),
    avatarUrl: profileAvatarUrlSchema.parse(value.avatarUrl),
  };
}
