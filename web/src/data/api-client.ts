import {
  AxiosError,
  AxiosHeaders,
  create,
  isCancel,
  type AxiosRequestConfig,
  type AxiosResponse,
} from "axios";
import { API_BASE_URL } from "@/lib/config";

/**
 * HTTP client for the iPhotos backend — docs/plans/09-backend-api.md.
 *
 * - The base URL comes strictly from NEXT_PUBLIC_API_URL; there is no default
 *   endpoint and the module fails fast when it is missing or malformed.
 * - The access token lives in memory only; the refresh token persists in
 *   localStorage (web/desktop v1 — hardening with an httpOnly cookie is a
 *   documented follow-up, doc 14 §2).
 * - A 401 triggers a single-flight refresh (`POST /api/auth/refresh`) and one
 *   retry of the original request. When the refresh fails, the session is
 *   discarded and the session-expired listeners run (the app routes to login).
 * - Errors are always surfaced as `ApiError` (backend shape `{ error }`).
 */

declare module "axios" {
  export interface AxiosRequestConfig {
    /** Skip attaching the Bearer token and the 401 refresh retry (auth endpoints). */
    anonymous?: boolean;
    /** Internal: set on the automatic retry after a refresh. */
    _retried?: boolean;
  }
}

export const API_URL = API_BASE_URL;

const REFRESH_TOKEN_KEY = "auth.refreshToken.v1";

const DEV = process.env.NODE_ENV !== "production";

function readRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeRefreshToken(token: string): void {
  try {
    localStorage.setItem(REFRESH_TOKEN_KEY, token);
  } catch {
    // Storage unavailable (private mode) — the session works until the tab closes.
  }
}

function removeRefreshToken(): void {
  try {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch {
    // Nothing to clean up.
  }
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
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
  if (!body.accessToken || !body.refreshToken) throw new ApiError(500, "Malformed auth response");
  return {
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
    refreshTokenExpiresAt: body.refreshTokenExpiresAt ?? "",
  };
}

let accessToken: string | null = null;
let refreshToken: string | null = readRefreshToken();
let refreshInFlight: Promise<string> | null = null;

type SessionExpiredListener = () => void;
const sessionExpiredListeners = new Set<SessionExpiredListener>();

/** The app registers a listener (route to login) — the data layer stays UI-free. */
export function onSessionExpired(listener: SessionExpiredListener): () => void {
  sessionExpiredListeners.add(listener);
  return () => sessionExpiredListeners.delete(listener);
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function hasSession(): boolean {
  return accessToken !== null || refreshToken !== null;
}

export function setSession(tokens: AuthTokens): void {
  accessToken = tokens.accessToken;
  refreshToken = tokens.refreshToken;
  writeRefreshToken(tokens.refreshToken);
}

export async function restoreSession(): Promise<boolean> {
  if (accessToken) return true;
  if (!refreshToken) return false;
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
  removeRefreshToken();
}

async function forceSignOut(): Promise<void> {
  await clearSession();
  for (const listener of sessionExpiredListeners) listener();
}

/** Dev-console telemetry for every failed request — never surfaced to the UI. */
function logRequestFailure(error: AxiosError): void {
  const { response, config } = error;
  const target = `${config?.method?.toUpperCase() ?? "GET"} ${config?.baseURL ?? ""}${config?.url ?? ""}`;
  if (!response) {
    // No response at all: offline, DNS failure, TLS, timeout.
    console.warn(`[api] ${target} -> no response (${error.code ?? "unknown"}): ${error.message}`);
    return;
  }
  const rawBody = response.data;
  const body =
    typeof rawBody === "string"
      ? rawBody.slice(0, 300)
      : rawBody == null
        ? "<empty>"
        : JSON.stringify(rawBody).slice(0, 300);
  const contentType = String(response.headers?.["content-type"] ?? "");
  console.warn(`[api] ${target} -> ${response.status} ${contentType} body: ${body}`);
}

function toApiError(error: AxiosError): ApiError {
  if (DEV) logRequestFailure(error);
  const { response } = error;
  if (!response) {
    // Axios rejects without a response on network-level failures (offline, DNS, timeout).
    return new ApiError(0, "Network error — check your connection and try again.");
  }
  if (response.status >= 500) {
    // 5xx bodies may be non-JSON (proxy/CDN error pages) and carry nothing actionable.
    return new ApiError(response.status, "The server is temporarily unavailable — try again in a moment.");
  }
  const data = response.data as { error?: unknown } | undefined;
  const message =
    data && typeof data === "object" && typeof data.error === "string"
      ? data.error
      : `Request failed (${response.status})`;
  return new ApiError(response.status, message);
}

const http = create({ baseURL: API_URL });

http.interceptors.request.use((config) => {
  if (!config.anonymous && accessToken) {
    config.headers = AxiosHeaders.from(config.headers).set("Authorization", `Bearer ${accessToken}`);
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
        config.headers = AxiosHeaders.from(config.headers).set("Authorization", `Bearer ${token}`);
        return http.request(config);
      } catch {
        await forceSignOut();
      }
    }
    throw toApiError(error);
  },
);

async function refreshAccessToken(force = false): Promise<string> {
  if (accessToken && !force) return accessToken;
  if (!refreshToken) throw new ApiError(401, "No active session");
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const response = await http.post<AuthResponse>(
        "/api/auth/refresh",
        { refreshToken },
        { anonymous: true },
      );
      const tokens = extractTokens(response.data);
      accessToken = tokens.accessToken;
      refreshToken = tokens.refreshToken;
      writeRefreshToken(tokens.refreshToken);
      return accessToken;
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export interface ApiOptions {
  method?: AxiosRequestConfig["method"];
  /** JSON request body. */
  body?: unknown;
  /** Query-string parameters. */
  params?: Record<string, unknown>;
  headers?: Record<string, string>;
  responseType?: AxiosRequestConfig["responseType"];
  /** Skip attaching the Bearer token and the 401 refresh retry (auth endpoints). */
  anonymous?: boolean;
  signal?: AbortSignal;
}

/** Performs a request through the authenticated axios instance and returns the parsed body. */
export async function apiJson<T>(path: string, options: ApiOptions = {}): Promise<T> {
  let response: AxiosResponse<T>;
  try {
    response = await http.request<T>({
      url: path,
      method: options.method ?? "GET",
      params: options.params,
      headers: options.headers,
      data: options.body,
      responseType: options.responseType,
      anonymous: options.anonymous,
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw toApiError(error as AxiosError);
  }
  if (response.status === 204 || response.data === "" || response.data === undefined) {
    return undefined as T;
  }
  return response.data;
}

/** Headers for raw (non-axios) authenticated requests such as file downloads. */
export function authHeaders(): Record<string, string> {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

export interface UploadByteProgress {
  sentBytes: number;
  totalBytes: number;
}

export interface ApiUploadOptions {
  /** Extra query-string parameters (e.g. fileName for zip imports). */
  params?: Record<string, unknown>;
  onProgress?: (progress: UploadByteProgress) => void;
  signal?: AbortSignal;
}

/**
 * Uploads a multipart/form-data payload through the authenticated axios
 * instance, so 401 refresh/retry and ApiError mapping behave exactly like
 * every other request. Cancellation propagates as-is (axios CanceledError).
 */
export async function apiUpload<T>(
  path: string,
  formData: FormData,
  options: ApiUploadOptions = {},
): Promise<T> {
  let response: AxiosResponse<T>;
  try {
    response = await http.request<T>({
      url: path,
      method: "POST",
      data: formData,
      params: options.params,
      onUploadProgress: (event) => {
        if (event.total) options.onProgress?.({ sentBytes: event.loaded, totalBytes: event.total });
      },
      signal: options.signal,
    });
  } catch (error) {
    if (isCancel(error)) throw error;
    if (error instanceof ApiError) throw error;
    throw toApiError(error as AxiosError);
  }
  return response.data;
}

/** Forces a token refresh — used by raw requests that got a 401 outside the axios instance. */
export function forceRefreshAccessToken(): Promise<string> {
  return refreshAccessToken(true);
}

/** Exchanges credentials for tokens and activates the session. */
export async function login(email: string, password: string): Promise<AuthUser> {
  const body = await apiJson<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: { email, password },
    anonymous: true,
  });
  setSession(extractTokens(body));
  return { email };
}

export async function register(
  email: string,
  password: string,
  displayName?: string,
): Promise<AuthUser> {
  const body = await apiJson<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: { email, password, displayName: displayName || undefined },
    anonymous: true,
  });
  setSession(extractTokens(body));
  return { userId: body.userId ?? "", email: body.email ?? email, displayName: body.displayName };
}

/** Revokes the refresh token on the server (idempotent) and clears the session. */
export async function logout(): Promise<void> {
  const token = refreshToken;
  const access = accessToken;
  await clearSession();
  if (!token) return;
  // Best-effort: signing out must succeed locally even when offline.
  await http
    .post(
      "/api/auth/logout",
      { refreshToken: token },
      {
        anonymous: true,
        headers: access ? { Authorization: `Bearer ${access}` } : undefined,
      },
    )
    .catch(() => undefined);
}
