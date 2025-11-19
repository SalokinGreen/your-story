"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/app/misc/supabase";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signUp: (
    email: string,
    password: string
  ) => Promise<{ error: string | null; emailSent?: boolean }>;
  signIn: (
    email: string,
    password: string
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<{ error: string | null }>;
  getEncryptionPassword: () => string | null;
  hasEncryptionPassword: () => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// SessionStorage key for encryption password
const ENCRYPTION_PASSWORD_KEY = "__story_encryption_key";

/**
 * Securely stores the user's password in sessionStorage for encryption
 * Only available during the current browser session
 */
function storeEncryptionPassword(password: string) {
  if (typeof window !== "undefined") {
    sessionStorage.setItem(ENCRYPTION_PASSWORD_KEY, password);
  }
}

/**
 * Retrieves the stored encryption password
 */
function getStoredEncryptionPassword(): string | null {
  if (typeof window !== "undefined") {
    return sessionStorage.getItem(ENCRYPTION_PASSWORD_KEY);
  }
  return null;
}

/**
 * Clears the stored encryption password
 */
function clearEncryptionPassword() {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(ENCRYPTION_PASSWORD_KEY);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);

      // Clear encryption password if no session
      if (!session) {
        clearEncryptionPassword();
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);

      // Clear encryption password on sign out
      if (!session) {
        clearEncryptionPassword();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string) => {
    try {
      // Use Supabase client directly for sign up
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        return { error: error.message, emailSent: false };
      }

      // Store password for encryption (will be available after email confirmation)
      storeEncryptionPassword(password);

      // Do NOT auto-log in; require email confirmation instead
      return { error: null, emailSent: true };
    } catch (error) {
      console.error("Sign up error:", error);
      return { error: "Network error", emailSent: false };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      // Use Supabase client directly for sign in
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { error: error.message };
      }

      if (data.user) {
        setUser(data.user);
        // Store password for encryption
        storeEncryptionPassword(password);
      }

      return { error: null };
    } catch (error) {
      console.error("Sign in error:", error);
      return { error: "Network error" };
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        return { error: error.message };
      }

      setUser(null);
      // Clear encryption password on sign out
      clearEncryptionPassword();
      return { error: null };
    } catch (error) {
      console.error("Sign out error:", error);
      return { error: "Network error" };
    }
  };

  const getEncryptionPassword = (): string | null => {
    return getStoredEncryptionPassword();
  };

  const hasEncryptionPassword = (): boolean => {
    return getStoredEncryptionPassword() !== null;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signUp,
        signIn,
        signOut,
        getEncryptionPassword,
        hasEncryptionPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
