"use client";

import { useState } from "react";
import { supabase } from "@/app/misc/supabase";
import { useNotification } from "@/app/misc/NotificationContext";

interface AdminControlsProps {
  userId: string;
  userEmail: string;
  currentRole?: string;
  onSuccess?: () => void;
}

export default function AdminControls({ userId, userEmail, currentRole, onSuccess }: AdminControlsProps) {
  const { addNotification } = useNotification();
  const [amount, setAmount] = useState(10);
  const [role, setRole] = useState<"user" | "moderator" | "admin">(currentRole as any || "user");
  const [loading, setLoading] = useState(false);
  const [roleLoading, setRoleLoading] = useState(false);

  const handleMint = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        addNotification("Please sign in to mint tokens", "warning");
        setLoading(false);
        return;
      }

      const response = await fetch("/api/tokens/mint", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          userId: userId,
          amount: amount,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        addNotification(`❌ ${data.error || "Failed to mint tokens"}`, "failure");
        setLoading(false);
        return;
      }

      addNotification(`✓ Minted ${amount} token(s) for ${userEmail}`, "success");
      setAmount(10);
      onSuccess?.();
    } catch (error) {
      console.error("Error minting tokens:", error);
      addNotification("Network error. Please try again.", "failure");
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setRoleLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        addNotification("Please sign in to change roles", "warning");
        setRoleLoading(false);
        return;
      }

      const response = await fetch(`/api/users/${userId}/role`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          role: role,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        addNotification(`❌ ${data.error || "Failed to change role"}`, "failure");
        setRoleLoading(false);
        return;
      }

      addNotification(`✓ Changed role to ${role} for ${userEmail}`, "success");
      onSuccess?.();
    } catch (error) {
      console.error("Error changing role:", error);
      addNotification("Network error. Please try again.", "failure");
    } finally {
      setRoleLoading(false);
    }
  };

  return (
    <div className="bg-linear-to-br from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 rounded-2xl shadow-xl p-6 sm:p-8 border-2 border-red-400 dark:border-red-600">
      <h3 className="text-lg sm:text-xl font-bold mb-6 flex items-center gap-2 text-red-800 dark:text-red-200">
        <span className="text-2xl">🔐</span>
        Admin Controls
      </h3>
      
      <div className="space-y-6">
        {/* Mint Tokens Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-5 border border-red-200 dark:border-red-800">
          <form onSubmit={handleMint} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="mint-amount" className="font-bold text-gray-900 dark:text-white">
                💎 Mint Tokens:
              </label>
              <input
                id="mint-amount"
                type="number"
                min="1"
                value={amount}
                onChange={(e) => setAmount(parseInt(e.target.value) || 1)}
                className="px-4 py-3 border-2 border-red-300 dark:border-red-700 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-red-500 dark:focus:border-red-400 focus:ring-2 focus:ring-red-200 dark:focus:ring-red-800 transition-colors"
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              disabled={loading || amount <= 0}
              className="px-6 py-3 bg-linear-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? "Minting..." : `💎 Mint ${amount} Token(s)`}
            </button>
          </form>
        </div>

        {/* Divider */}
        <div className="border-t-2 border-red-300 dark:border-red-700"></div>

        {/* Change Role Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-5 border border-red-200 dark:border-red-800">
          <form onSubmit={handleRoleChange} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="role-select" className="font-bold text-gray-900 dark:text-white">
                👤 Change User Role:
              </label>
              <select
                id="role-select"
                value={role}
                onChange={(e) => setRole(e.target.value as "user" | "moderator" | "admin")}
                className="px-4 py-3 border-2 border-red-300 dark:border-red-700 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-red-500 dark:focus:border-red-400 focus:ring-2 focus:ring-red-200 dark:focus:ring-red-800 transition-colors"
                disabled={roleLoading}
              >
                <option value="user">User</option>
                <option value="moderator">Moderator</option>
                <option value="admin">Admin</option>
              </select>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Current role: <span className="font-semibold text-gray-900 dark:text-white">{currentRole || "user"}</span>
              </p>
            </div>
            <button
              type="submit"
              disabled={roleLoading || role === currentRole}
              className="px-6 py-3 bg-linear-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {roleLoading ? "Changing..." : "👤 Change Role"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
