/** Profile fields stored in users/{uid}. Must match isUserDoc() in firestore.rules. */
export interface ProfileFields {
  displayName?: string;
  email?: string;
  photoURL?: string | null;
}

export interface ProfileSource {
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

const MAX_NAME = 100;
const MAX_EMAIL = 254;
const MAX_URL = 2048;

/** Accepts only absolute https URLs within the stored length limit. */
export function isSafePhotoUrl(url: string): boolean {
  if (url.length > MAX_URL) return false;
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

/** Normalizes auth-provider data into fields the security rules accept. */
export function toProfileFields(src: ProfileSource): ProfileFields {
  const out: ProfileFields = {};
  const name = src.displayName?.trim();
  if (name) out.displayName = name.slice(0, MAX_NAME);
  const email = src.email?.trim();
  if (email && email.length <= MAX_EMAIL) out.email = email;
  out.photoURL = src.photoURL && isSafePhotoUrl(src.photoURL) ? src.photoURL : null;
  return out;
}

/** Returns only the fields that differ from what is stored, or null if nothing changed. */
export function changedFields(
  stored: Partial<Record<keyof ProfileFields, unknown>> | undefined,
  next: ProfileFields,
): ProfileFields | null {
  const diff: ProfileFields = {};
  for (const key of Object.keys(next) as (keyof ProfileFields)[]) {
    if ((stored?.[key] ?? null) !== (next[key] ?? null)) {
      (diff as Record<string, unknown>)[key] = next[key];
    }
  }
  return Object.keys(diff).length ? diff : null;
}
