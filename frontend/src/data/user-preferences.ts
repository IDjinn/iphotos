import { apiJson } from '@/data/api-client';

/**
 * Account-wide upload preferences. The backend owns the quality rules: it stores
 * the choice, computes the effective caps for the plan and reports how many
 * stored photos can still be rewritten to match. The app only renders them.
 */

export type UploadQuality = 'original' | 'storageSaver';

export interface UserPreferences {
  uploadQuality: UploadQuality;
  /** Stored photos that can still be rewritten to match the current quality. */
  mismatchedPhotoCount: number;
  /** Effective per-file caps for the account's (plan, quality) mode. */
  imageCapBytes: number;
  videoCapBytes: number;
}

export async function getUserPreferences(): Promise<UserPreferences> {
  return apiJson<UserPreferences>('/api/me/preferences');
}

/**
 * Persists the upload quality for the account. With `applyToExisting`, the
 * backend re-processes stored photos that don't match yet (original → saver).
 */
export async function updateUserPreferences(
  uploadQuality: UploadQuality,
  applyToExisting: boolean
): Promise<UserPreferences> {
  return apiJson<UserPreferences>('/api/me/preferences', {
    method: 'PUT',
    body: { uploadQuality, applyToExisting },
  });
}
