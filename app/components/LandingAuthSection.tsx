"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../misc/AuthContext";
import AuthForm from "./AuthForm";
import { supabase } from "../misc/supabase";
import { StaticIcon } from "./StaticIcon";

/**
 * Client-side auth section for the landing page hero.
 * Separated to allow the rest of the page to be server-rendered.
 */
export default function LandingAuthSection() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [showAuth, setShowAuth] = useState(false);

  if (loading) {
    // Minimal skeleton to prevent CLS
    return (
      <div className="flex flex-wrap justify-center gap-3 mb-6 min-h-11">
        <div className="w-24 h-10 bg-blue-600/30 rounded-lg animate-pulse" />
        <div className="w-36 h-10 bg-blue-950/50 rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap justify-center gap-3 mb-6">
      {user ? (
        <>
          <button
            onClick={() => router.push("/library")}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2 text-sm"
          >
            <StaticIcon name="Library" className="w-4 h-4" /> Library
          </button>
          <button
            onClick={() => router.push("/creator")}
            className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2 text-sm"
          >
            <StaticIcon name="Wand2" className="w-4 h-4" /> Create
          </button>
          <button
            onClick={() => router.push("/explorer")}
            className="px-5 py-2 bg-blue-950/80 hover:bg-blue-900/80 text-blue-200 font-medium rounded-lg border border-blue-800/30 transition-colors flex items-center gap-2 text-sm"
          >
            <StaticIcon name="Compass" className="w-4 h-4" /> Explore
          </button>
          <button
            onClick={() => router.push(`/profile/${user.id}`)}
            className="px-5 py-2 bg-blue-950/80 hover:bg-blue-900/80 text-blue-200 font-medium rounded-lg border border-blue-800/30 transition-colors flex items-center gap-2 text-sm"
          >
            <StaticIcon name="User" className="w-4 h-4" /> Profile
          </button>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              router.push("/");
            }}
            className="px-5 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-300 font-medium rounded-lg border border-red-500/30 transition-colors flex items-center gap-2 text-sm"
          >
            <StaticIcon name="LogOut" className="w-4 h-4" /> Logout
          </button>
        </>
      ) : (
        <>
          {showAuth ? (
            <div className="w-full max-w-md bg-blue-950/50 rounded-xl border border-blue-800/30 p-4">
              <AuthForm />
              <button
                onClick={() => setShowAuth(false)}
                className="mt-3 text-sm text-blue-200/40 hover:text-blue-200/60"
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={() => setShowAuth(true)}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
              >
                Sign In
              </button>
              <button
                onClick={() => router.push("/explorer")}
                className="px-6 py-2.5 bg-blue-950/80 hover:bg-blue-900/80 text-blue-200 font-medium rounded-lg border border-blue-800/30 transition-colors"
              >
                Browse Adventures
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
