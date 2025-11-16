import { supabase } from "./supabase";

/**
 * Gets the current Supabase session access token.
 * This helper ensures we get a fresh, valid token for API calls.
 * 
 * @returns The access token string, or null if not authenticated
 */
export async function getAuthToken(): Promise<string | null> {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error("Error getting session:", error);
      return null;
    }
    
    return session?.access_token || null;
  } catch (error) {
    console.error("Failed to get auth token:", error);
    return null;
  }
}

/**
 * Makes an authenticated fetch request with automatic token injection.
 * 
 * @param url - The URL to fetch
 * @param options - Standard fetch options
 * @returns The fetch response
 */
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getAuthToken();
  
  if (!token) {
    throw new Error("Not authenticated");
  }
  
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${token}`);
  
  return fetch(url, {
    ...options,
    headers,
  });
}
