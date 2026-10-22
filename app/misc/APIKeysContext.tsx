"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { isStandalone } from "./standalone";
import { openExternalUrl } from "./openExternal";
import {
  buildOpenRouterAuthUrl,
  exchangeOpenRouterCode,
  generatePKCE,
} from "./openRouterOAuth";

export interface APIKeys {
  openRouterKey: string;
  deepseekKey: string;
  googleKey: string;
  mistralKey: string;
  deepinfraKey: string;
  // Z.ai's general pay-as-you-go API, never its Coding Plan (decision 18).
  zaiKey: string;
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
  // Native builds only: the sign-in page is open in the browser and the
  // app is waiting for the user to paste back the code it shows
  awaitingOpenRouterCode: boolean;
  connectOpenRouter: () => void;
  submitOpenRouterCode: (code: string) => Promise<void>;
  cancelOpenRouterConnect: () => void;
  disconnectOpenRouter: () => void;
}

const defaultKeys: APIKeys = {
  openRouterKey: "",
  deepseekKey: "",
  googleKey: "",
  mistralKey: "",
  deepinfraKey: "",
  zaiKey: "",
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
  zaiKey: "zaiKey",
  braveSearchKey: "braveSearchKey",
  cartesiaKey: "cartesiaKey",
  elevenlabsKey: "elevenlabsKey",
  oauthCodeVerifier: "openrouter_code_verifier",
};

export function APIKeysProvider({ children }: { children: React.ReactNode }) {
  const [keys, setKeys] = useState<APIKeys>(defaultKeys);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isConnectingOpenRouter, setIsConnectingOpenRouter] = useState(false);
  const [awaitingOpenRouterCode, setAwaitingOpenRouterCode] = useState(false);

  // Load keys from localStorage
  const loadKeys = useCallback(async () => {
    const localKeys: APIKeys = {
      openRouterKey: localStorage.getItem(LOCAL_KEYS.openRouterKey) || "",
      deepseekKey: localStorage.getItem(LOCAL_KEYS.deepseekKey) || "",
      googleKey: localStorage.getItem(LOCAL_KEYS.googleKey) || "",
      mistralKey: localStorage.getItem(LOCAL_KEYS.mistralKey) || "",
      deepinfraKey: localStorage.getItem(LOCAL_KEYS.deepinfraKey) || "",
      zaiKey: localStorage.getItem(LOCAL_KEYS.zaiKey) || "",
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
          const key = await exchangeOpenRouterCode(code, codeVerifier);
          setKey("openRouterKey", key);
          // Clean up URL and localStorage
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname,
          );
          localStorage.removeItem(LOCAL_KEYS.oauthCodeVerifier);
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

  // Start OpenRouter OAuth flow
  const connectOpenRouter = useCallback(async () => {
    setIsConnectingOpenRouter(true);
    try {
      const { codeVerifier, codeChallenge } = await generatePKCE();

      // Store code verifier for the callback / pasted code
      localStorage.setItem(LOCAL_KEYS.oauthCodeVerifier, codeVerifier);

      if (isStandalone()) {
        // Native: there's no page OpenRouter can redirect back to, so sign
        // in in a real browser and have the user paste the code it shows
        // (see openRouterOAuth.ts).
        await openExternalUrl(buildOpenRouterAuthUrl({ codeChallenge }));
        setAwaitingOpenRouterCode(true);
        setIsConnectingOpenRouter(false);
        return;
      }

      // Web: redirect back to the current page
      window.location.href = buildOpenRouterAuthUrl({
        codeChallenge,
        callbackUrl: `${window.location.origin}${window.location.pathname}`,
      });
    } catch (error) {
      console.error("Error starting OpenRouter OAuth:", error);
      setIsConnectingOpenRouter(false);
    }
  }, []);

  // Native flow, second half: exchange the code the user pasted back.
  // Throws a user-facing message if OpenRouter rejects it.
  const submitOpenRouterCode = useCallback(
    async (code: string) => {
      const codeVerifier = localStorage.getItem(LOCAL_KEYS.oauthCodeVerifier);
      if (!codeVerifier) {
        setAwaitingOpenRouterCode(false);
        throw new Error("That sign-in was already used. Start it again.");
      }
      setIsConnectingOpenRouter(true);
      try {
        const key = await exchangeOpenRouterCode(code, codeVerifier);
        setKey("openRouterKey", key);
        localStorage.removeItem(LOCAL_KEYS.oauthCodeVerifier);
        setAwaitingOpenRouterCode(false);
      } finally {
        setIsConnectingOpenRouter(false);
      }
    },
    [setKey],
  );

  const cancelOpenRouterConnect = useCallback(() => {
    localStorage.removeItem(LOCAL_KEYS.oauthCodeVerifier);
    setAwaitingOpenRouterCode(false);
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
        awaitingOpenRouterCode,
        connectOpenRouter,
        submitOpenRouterCode,
        cancelOpenRouterConnect,
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
