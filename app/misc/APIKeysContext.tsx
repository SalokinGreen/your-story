"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";

export interface APIKeys {
  openRouterKey: string;
  deepseekKey: string;
  googleKey: string;
  mistralKey: string;
  deepinfraKey: string;
  braveSearchKey: string;
  cartesiaKey: string;
  elevenlabsKey: string;
}

export interface APIKeysContextType {
  // Keys (from localStorage)
  keys: APIKeys;
  // Whether keys are loaded
  isLoaded: boolean;
  // Update a specific key
  setKey: (provider: keyof APIKeys, key: string) => void;
  // Check if a provider is configured
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
  googleKey: "",
  mistralKey: "",
  deepinfraKey: "",
  braveSearchKey: "",
  cartesiaKey: "",
  elevenlabsKey: "",
};

const APIKeysContext = createContext<APIKeysContextType | undefined>(undefined);

// localStorage keys
const LOCAL_KEYS = {
  openRouterKey: "openRouterKey",
  deepseekKey: "deepseekKey",
  googleKey: "googleKey",
  mistralKey: "mistralKey",
  deepinfraKey: "deepinfraKey",
  braveSearchKey: "braveSearchKey",
  cartesiaKey: "cartesiaKey",
  elevenlabsKey: "elevenlabsKey",
  oauthCodeVerifier: "openrouter_code_verifier",
};

export function APIKeysProvider({ children }: { children: React.ReactNode }) {
  const [keys, setKeys] = useState<APIKeys>(defaultKeys);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isConnectingOpenRouter, setIsConnectingOpenRouter] = useState(false);

  // Load keys from localStorage
  const loadKeys = useCallback(async () => {
    const localKeys: APIKeys = {
      openRouterKey: localStorage.getItem(LOCAL_KEYS.openRouterKey) || "",
      deepseekKey: localStorage.getItem(LOCAL_KEYS.deepseekKey) || "",
      googleKey: localStorage.getItem(LOCAL_KEYS.googleKey) || "",
      mistralKey: localStorage.getItem(LOCAL_KEYS.mistralKey) || "",
      deepinfraKey: localStorage.getItem(LOCAL_KEYS.deepinfraKey) || "",
      braveSearchKey: localStorage.getItem(LOCAL_KEYS.braveSearchKey) || "",
      cartesiaKey: localStorage.getItem(LOCAL_KEYS.cartesiaKey) || "",
      elevenlabsKey: localStorage.getItem(LOCAL_KEYS.elevenlabsKey) || "",
    };

    setKeys(localKeys);
    setIsLoaded(true);
  }, []);

  // Load keys on mount
  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  // Set a specific key
  const setKey = useCallback((provider: keyof APIKeys, key: string) => {
    setKeys((prev) => ({ ...prev, [provider]: key }));
    localStorage.setItem(LOCAL_KEYS[provider], key);
  }, []);

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
            },
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
                window.location.pathname,
              );
              localStorage.removeItem(LOCAL_KEYS.oauthCodeVerifier);
            }
          } else {
            console.error(
              "Failed to exchange OAuth code:",
              await response.text(),
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
  }, [setKey]);

  // Check if a provider has a key configured
  const hasKey = useCallback(
    (provider: keyof APIKeys) => {
      return !!keys[provider];
    },
    [keys],
  );

  // Generate code verifier and challenge for PKCE
  const generatePKCE = async () => {
    // Generate random code verifier
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const codeVerifier = Array.from(array, (byte) =>
      byte.toString(16).padStart(2, "0"),
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
        setKey,
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
