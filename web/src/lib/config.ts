// App configuration. The API base URL comes exclusively from NEXT_PUBLIC_API_URL —
// no default, mirroring the mobile app contract (docs/plans/09 §2).
function readApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL;
  if (!raw) {
    throw new Error(
      "NEXT_PUBLIC_API_URL is not set. Define it in web/.env (e.g. http://localhost:5205).",
    );
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`NEXT_PUBLIC_API_URL is not a valid URL: "${raw}".`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`NEXT_PUBLIC_API_URL must be an http(s) URL, received "${raw}".`);
  }
  return raw.replace(/\/+$/, "");
}

export const API_BASE_URL = readApiBaseUrl();
