"use client";

import { useState } from "react";
import { useAuth } from "@/app/misc/AuthContext";

export default function AuthForm() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
    const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const { signUp, signIn } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);

    const result = isSignUp
      ? await signUp(email, password)
      : await signIn(email, password);

    setLoading(false);

    if (result.error) {
      setError(result.error);
    } else {
      if (isSignUp) {
        setInfo("Check your email to confirm your account before signing in.");
      } else {
        setEmail("");
        setPassword("");
      }
    }
  };

  return (
    <div className="w-full max-w-md">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5 bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700">
        <div className="text-center">
          <h2 className="text-2xl sm:text-3xl font-bold bg-linear-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent mb-2">
            {isSignUp ? "Join Your Story" : "Welcome Back"}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {isSignUp ? "Create an account to start your adventure" : "Sign in to continue your journey"}
          </p>
        </div>

        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 rounded-lg text-sm">
            {error}
          </div>
        )}

        {info && (
          <div className="p-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200 rounded-lg text-sm">
            {info}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <label htmlFor="email" className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-blue-500 dark:focus:border-blue-400 focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 transition-colors"
            placeholder="you@example.com"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="password" className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-blue-500 dark:focus:border-blue-400 focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 transition-colors"
            placeholder="••••••••"
          />
          {isSignUp && (
            <p className="text-xs text-gray-500 dark:text-gray-400">Minimum 6 characters</p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="px-6 py-3 bg-linear-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 text-white rounded-lg font-semibold transition-all shadow-md hover:shadow-lg disabled:cursor-not-allowed"
        >
          {loading ? "Loading..." : isSignUp ? "Create Account" : "Sign In"}
        </button>

        {isSignUp && (
          <button
            type="button"
            disabled={loading || !email}
            onClick={async () => {
              setError("");
              setInfo("");
              try {
                const res = await fetch("/api/auth/resend-confirmation", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ email }),
                });
                const data = await res.json();
                if (!res.ok) {
                  setError(data.error || "Could not resend confirmation email.");
                } else {
                  setInfo("Confirmation email resent. Please check your inbox (and spam folder).");
                }
              } catch (err) {
                setError("Network error while resending confirmation email.");
              }
            }}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium self-start"
          >
            Resend confirmation email
          </button>
        )}

        <button
          type="button"
          onClick={() => setIsSignUp(!isSignUp)}
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium"
        >
          {isSignUp ? "Already have an account? Sign In" : "Don't have an account? Sign Up"}
        </button>
      </form>
    </div>
  );
}
