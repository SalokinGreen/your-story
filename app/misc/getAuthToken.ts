/**
 * Legacy auth helpers, kept as no-ops now that the app is fully local/BYOK
 * and no longer has a backend authentication system. Call sites that only
 * used these for adding an Authorization header can be left as-is since the
 * API routes no longer require auth.
 */

export async function getAuthToken(): Promise<string | null> {
  return null;
}

export async function authenticatedFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  return fetch(url, options);
}
