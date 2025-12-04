"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { useAuth } from "./AuthContext";
import { useSubscription } from "./SubscriptionContext";
import { supabase } from "./supabase";

export interface APIKeys {
  openRouterKey: string;
  deepseekKey: string;
  novelaiKey: string;
}

export interface APIKeysContextType {
  // Keys (from localStorage or DB)
  keys: APIKeys;
  // Whether keys are loaded
  isLoaded: boolean;
  // Whether user has enabled global (DB) key storage
  useGlobalKeys: boolean;
  // Whether user has BYOK access (based on subscription tier)
  hasByokAccess: boolean;
  // Update a specific key
  setKey: (provider: keyof APIKeys, key: string) => void;
  // Toggle global key storage
  setUseGlobalKeys: (enabled: boolean) => Promise<void>;
  // Check if a provider is configured AND user has access
  hasKey: (provider: keyof APIKeys) => boolean;
  // Refresh keys from storage
  refreshKeys: () => Promise<void>;
  // OpenRouter OAuth state
  isConnectingOpenRouter: boolean;
  connectOpenRouter: () => void;
  disconnectOpenRouter: () => void;
}

const defaultKeys: APIKeys = {
  openRouterKey: "",
  deepseekKey: "",
  novelaiKey: "",
};

const APIKeysContext = createContext<APIKeysContextType | undefined>(undefined);

// localStorage keys
const LOCAL_KEYS = {
  openRouterKey: "openRouterKey",
  deepseekKey: "deepseekKey",
  novelaiKey: "novelaiKey",
  useGlobalKeys: "useGlobalKeys",
  oauthCodeVerifier: "openrouter_code_verifier",
};

export function APIKeysProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { hasByokAccess } = useSubscription();
  const [keys, setKeys] = useState<APIKeys>(defaultKeys);
  const [isLoaded, setIsLoaded] = useState(false);
  const [useGlobalKeys, setUseGlobalKeysState] = useState(false);
  const [isConnectingOpenRouter, setIsConnectingOpenRouter] = useState(false);

  // Load keys from localStorage and optionally from DB
  const loadKeys = useCallback(async () => {
    // Always load from localStorage first
    const localKeys: APIKeys = {
      openRouterKey: localStorage.getItem(LOCAL_KEYS.openRouterKey) || "",
      deepseekKey: localStorage.getItem(LOCAL_KEYS.deepseekKey) || "",
      novelaiKey: localStorage.getItem(LOCAL_KEYS.novelaiKey) || "",
    };

    const globalEnabled =
      localStorage.getItem(LOCAL_KEYS.useGlobalKeys) === "true";
    setUseGlobalKeysState(globalEnabled);

    // If global keys enabled and user is logged in, fetch from DB
    if (globalEnabled && user) {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session) {
          const response = await fetch("/api/settings/api-keys", {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          });
          if (response.ok) {
            const dbKeys = await response.json();
            // DB keys override local keys if present
            setKeys({
              openRouterKey: dbKeys.openRouterKey || localKeys.openRouterKey,
              deepseekKey: dbKeys.deepseekKey || localKeys.deepseekKey,
              novelaiKey: dbKeys.novelaiKey || localKeys.novelaiKey,
            });
            setIsLoaded(true);
            return;
          }
        }
      } catch (error) {
        console.error("Error loading API keys from DB:", error);
      }
    }

    setKeys(localKeys);
    setIsLoaded(true);
  }, [user]);

  // Load keys on mount and when user changes
  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  // Handle OpenRouter OAuth callback
  useEffect(() => {
    const handleOAuthCallback = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get("code");
      const codeVerifier = localStorage.getItem(LOCAL_KEYS.oauthCodeVerifier);

      if (code && codeVerifier) {
        setIsConnectingOpenRouter(true);
        try {
          // Exchange code for API key
          const response = await fetch(
            "https://openrouter.ai/api/v1/auth/keys",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                code,
                code_verifier: codeVerifier,
                code_challenge_method: "S256",
              }),
            }
          );

          if (response.ok) {
            const { key } = await response.json();
            if (key) {
              // Save the key
              setKey("openRouterKey", key);
              // Clean up URL and localStorage
              window.history.replaceState(
                {},
                document.title,
                window.location.pathname
              );
              localStorage.removeItem(LOCAL_KEYS.oauthCodeVerifier);
            }
          } else {
            console.error(
              "Failed to exchange OAuth code:",
              await response.text()
            );
          }
        } catch (error) {
          console.error("OAuth callback error:", error);
        } finally {
          setIsConnectingOpenRouter(false);
        }
      }
    };

    handleOAuthCallback();
  }, []);

  // Set a specific key
  const setKey = useCallback(
    async (provider: keyof APIKeys, key: string) => {
      // Update state
      setKeys((prev) => ({ ...prev, [provider]: key }));

      // Always save to localStorage
      localStorage.setItem(LOCAL_KEYS[provider], key);

      // If global keys enabled and user logged in, also save to DB
      if (useGlobalKeys && user) {
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (session) {
            await fetch("/api/settings/api-keys", {
              method: "PATCH",
              headers: {
                Authorization: `Bearer ${session.access_token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ [provider]: key }),
            });
          }
        } catch (error) {
          console.error("Error saving API key to DB:", error);
        }
      }
    },
    [useGlobalKeys, user]
  );

  // Toggle global key storage
  const setUseGlobalKeys = useCallback(
    async (enabled: boolean) => {
      setUseGlobalKeysState(enabled);
      localStorage.setItem(
        LOCAL_KEYS.useGlobalKeys,
        enabled ? "true" : "false"
      );

      if (enabled && user) {
        // Sync current local keys to DB
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (session) {
            await fetch("/api/settings/api-keys", {
              method: "PUT",
              headers: {
                Authorization: `Bearer ${session.access_token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(keys),
            });
          }
        } catch (error) {
          console.error("Error syncing keys to DB:", error);
        }
      }
    },
    [user, keys]
  );

  // Check if a provider has a key configured AND user has BYOK access
  // Note: Keys are always stored, but only usable if user has BYOK access
  const hasKey = useCallback(
    (provider: keyof APIKeys) => {
      // Key must exist AND user must have BYOK access to use it
      return !!keys[provider] && hasByokAccess;
    },
    [keys, hasByokAccess]
  );

  // Generate code verifier and challenge for PKCE
  const generatePKCE = async () => {
    // Generate random code verifier
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const codeVerifier = Array.from(array, (byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("");

    // Generate code challenge (SHA-256 hash)
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const hash = await crypto.subtle.digest("SHA-256", data);
    const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    return { codeVerifier, codeChallenge };
  };

  // Start OpenRouter OAuth flow
  const connectOpenRouter = useCallback(async () => {
    setIsConnectingOpenRouter(true);
    try {
      const { codeVerifier, codeChallenge } = await generatePKCE();

      // Store code verifier for callback
      localStorage.setItem(LOCAL_KEYS.oauthCodeVerifier, codeVerifier);

      // Get callback URL (current page)
      const callbackUrl = `${window.location.origin}${window.location.pathname}`;

      // Redirect to OpenRouter auth
      const authUrl = new URL("https://openrouter.ai/auth");
      authUrl.searchParams.set("callback_url", callbackUrl);
      authUrl.searchParams.set("code_challenge", codeChallenge);
      authUrl.searchParams.set("code_challenge_method", "S256");

      window.location.href = authUrl.toString();
    } catch (error) {
      console.error("Error starting OpenRouter OAuth:", error);
      setIsConnectingOpenRouter(false);
    }
  }, []);

  // Disconnect OpenRouter (clear key)
  const disconnectOpenRouter = useCallback(() => {
    setKey("openRouterKey", "");
  }, [setKey]);

  return (
    <APIKeysContext.Provider
      value={{
        keys,
        isLoaded,
        useGlobalKeys,
        hasByokAccess,
        setKey,
        setUseGlobalKeys,
        hasKey,
        refreshKeys: loadKeys,
        isConnectingOpenRouter,
        connectOpenRouter,
        disconnectOpenRouter,
      }}
    >
      {children}
    </APIKeysContext.Provider>
  );
}

export function useAPIKeys() {
  const context = useContext(APIKeysContext);
  if (context === undefined) {
    throw new Error("useAPIKeys must be used within an APIKeysProvider");
  }
  return context;
}
