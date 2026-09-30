import { ApiError } from '@/data/api-client';

/** Maps backend auth errors (docs/plans/09-backend-api.md §3) to user-facing copy. */
export function authErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
        return error.message || 'Check your e-mail and password.';
      case 401:
        return 'Invalid e-mail or password.';
      case 409:
        return 'This e-mail is already registered — try logging in.';
      case 429:
        return 'Too many attempts — wait a minute and try again.';
      default:
        return error.message;
    }
  }
  return 'Could not reach the cloud service — check your connection or continue in offline mode.';
}
