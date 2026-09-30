import { AxiosError, AxiosHeaders, create, type AxiosRequestConfig, type AxiosResponse } from 'axios';
import * as SecureStore from 'expo-secure-store';

/**
 * HTTP client for the iPhotos backend — docs/plans/09-backend-api.md §4.
 *
 * - The base URL comes strictly from EXPO_PUBLIC_API_URL; there is no default
 *   endpoint. The app fails fast (config time and module load) when it is
 *   missing or malformed.
 * - Access token lives in memory only; the refresh token is persisted in
 *   SecureStore and survives app restarts.
 * - A 401 triggers a single-flight refresh (`POST /api/auth/refresh`) and one
 *   retry of the original request. If the refresh fails, the session is
 *   discarded and the account store falls back to offline mode.
 * - Errors are always surfaced as `ApiError` (backend shape `{ error }`).
 */

declare module 'axios' {
  export interface AxiosRequestConfig {
    /** Skip attaching the Bearer token and the 401 refresh retry (auth endpoints). */
    anonymous?: boolean;
    /** Internal: set on the automatic retry after a refresh. */
    _retried?: boolean;
  }
}

function resolveApiUrl(): string {
  const raw = process.env.EXPO_PUBLIC_API_URL;
  if (!raw) {
    throw new Error('EXPO_PUBLIC_API_URL is not set — configure the backend endpoint in .env (docs/plans/09-backend-api.md §2).');
  }
  if (!/^https?:\/\/.+/.test(raw)) {
    throw new Error(`EXPO_PUBLIC_API_URL is invalid: "${raw}" — expected an http(s) URL such as http://192.168.15.4:5205`);
  }
  return raw.replace(/\/+$/, '');
}

export const API_URL = resolveApiUrl();

const REFRESH_TOKEN_KEY = 'auth.refreshToken.v1';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

export interface AuthUser {
  /** Absent on login (only register returns it). */
  userId?: string;
  email: string;
  displayName?: string;
}

interface AuthResponse {
  userId?: string;
  email?: string;
  displayName?: string;
  tokens?: AuthTokens;
  accessToken?: string;
  refreshToken?: string;
  refreshTokenExpiresAt?: string;
}

/** Register wraps tokens in `{ tokens }`; login and refresh return them flat. */
function extractTokens(body: AuthResponse): AuthTokens {
  if (body.tokens) return body.tokens;
  if (!body.accessToken || !body.refreshToken) throw new ApiError(500, 'Malformed auth response');
  return {
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
    refreshTokenExpiresAt: body.refreshTokenExpiresAt ?? '',
  };
}

let accessToken: string | null = null;
let refreshToken: string | null = null;
let refreshInFlight: Promise<string> | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function hasSession(): boolean {
  return accessToken !== null || refreshToken !== null;
}

export function setSession(tokens: AuthTokens): void {
  accessToken = tokens.accessToken;
  refreshToken = tokens.refreshToken;
  void SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

export async function restoreSession(): Promise<boolean> {
  if (accessToken) return true;
  const stored = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  if (!stored) return false;
  refreshToken = stored;
  try {
    await refreshAccessToken();
    return true;
  } catch {
    await clearSession();
    return false;
  }
}

export async function clearSession(): Promise<void> {
  accessToken = null;
  refreshToken = null;
  refreshInFlight = null;
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY).catch(() => undefined);
}

async function forceSignOut(): Promise<void> {
  await clearSession();
  const { useAccountStore } = await import('@/stores/account');
  useAccountStore.getState().resetSession();
}

function toApiError(error: AxiosError): ApiError {
  const { response } = error;
  if (!response) {
    // Axios rejects without a response on network-level failures (offline, DNS, timeout).
    return new ApiError(0, 'Network error — check your connection and try again.');
  }
  const data = response.data as { error?: unknown } | undefined;
  const message =
    data && typeof data === 'object' && typeof data.error === 'string'
      ? data.error
      : `Request failed (${response.status})`;
  return new ApiError(response.status, message);
}

const http = create({ baseURL: API_URL });

http.interceptors.request.use((config) => {
  if (!config.anonymous && accessToken) {
    config.headers = AxiosHeaders.from(config.headers).set('Authorization', `Bearer ${accessToken}`);
  }
  return config;
});

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError): Promise<AxiosResponse> => {
    const config = error.config;
    if (error.response?.status === 401 && config && !config.anonymous && !config._retried) {
      config._retried = true;
      try {
        const token = await refreshAccessToken(true);
        config.headers = AxiosHeaders.from(config.headers).set('Authorization', `Bearer ${token}`);
        return http.request(config);
      } catch {
        await forceSignOut();
      }
    }
    throw toApiError(error);
  }
);

async function refreshAccessToken(force = false): Promise<string> {
  if (accessToken && !force) return accessToken;
  if (!refreshToken) throw new ApiError(401, 'No active session');
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const response = await http.post<AuthResponse>('/api/auth/refresh', { refreshToken }, { anonymous: true });
      const tokens = extractTokens(response.data);
      accessToken = tokens.accessToken;
      refreshToken = tokens.refreshToken;
      void SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken);
      return accessToken;
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export interface ApiOptions {
  method?: AxiosRequestConfig['method'];
  /** JSON request body. */
  body?: unknown;
  /** Query-string parameters. */
  params?: Record<string, unknown>;
  headers?: Record<string, string>;
  responseType?: AxiosRequestConfig['responseType'];
  /** Skip attaching the Bearer token and the 401 refresh retry (auth endpoints). */
  anonymous?: boolean;
}

/** Performs a request through the authenticated axios instance and returns the parsed body. */
export async function apiJson<T>(path: string, options: ApiOptions = {}): Promise<T> {
  let response: AxiosResponse<T>;
  try {
    response = await http.request<T>({
      url: path,
      method: options.method ?? 'GET',
      params: options.params,
      headers: options.headers,
      data: options.body,
      responseType: options.responseType,
      anonymous: options.anonymous,
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw toApiError(error as AxiosError);
  }
  if (response.status === 204 || response.data === '' || response.data === undefined) {
    return undefined as T;
  }
  return response.data;
}

/** Headers for image/file requests that bypass axios (expo-image, native uploads). */
export function authHeaders(): Record<string, string> {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

/** Forces a token refresh — used by raw uploads that got a 401 outside the axios instance. */
export function forceRefreshAccessToken(): Promise<string> {
  return refreshAccessToken(true);
}

/** Exchanges credentials for tokens and activates the session. */
export async function login(email: string, password: string): Promise<AuthUser> {
  const body = await apiJson<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: { email, password },
    anonymous: true,
  });
  setSession(extractTokens(body));
  return { email };
}

export async function register(email: string, password: string, displayName?: string): Promise<AuthUser> {
  const body = await apiJson<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: { email, password, displayName: displayName || undefined },
    anonymous: true,
  });
  setSession(extractTokens(body));
  return { userId: body.userId ?? '', email: body.email ?? email, displayName: body.displayName };
}

/** Revokes the refresh token on the server (idempotent) and clears the session. */
export async function logout(): Promise<void> {
  const token = refreshToken;
  const access = accessToken;
  await clearSession();
  if (!token) return;
  // Best-effort: signing out must succeed locally even when offline.
  await http
    .post('/api/auth/logout', { refreshToken: token }, {
      anonymous: true,
      headers: access ? { Authorization: `Bearer ${access}` } : undefined,
    })
    .catch(() => undefined);
}
