"use client";

import { useState } from "react";
import { supabase } from "@/app/misc/supabase";
import { useNotification } from "@/app/misc/NotificationContext";
import { DynamicIcon } from "./DynamicIcon";
import { SubscriptionTier, SUBSCRIPTION_TIERS } from "@/app/misc/subscriptions";

interface AdminControlsProps {
  userId: string;
  userName: string;
  currentRole?: string;
  onSuccess?: () => void;
}

export default function AdminControls({
  userId,
  userName,
  currentRole,
  onSuccess,
}: AdminControlsProps) {
  const { addNotification } = useNotification();
  const [amount, setAmount] = useState(10);
  const [removeAmount, setRemoveAmount] = useState(1);
  const [role, setRole] = useState<"user" | "moderator" | "admin">(
    (currentRole as any) || "user"
  );
  const [loading, setLoading] = useState(false);
  const [roleLoading, setRoleLoading] = useState(false);

  // Subscription admin state
  const [subTier, setSubTier] = useState<SubscriptionTier>("pro");
  const [subDuration, setSubDuration] = useState(30);
  const [subCoins, setSubCoins] = useState(500);
  const [subLoading, setSubLoading] = useState(false);

  const handleMint = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        addNotification("Please sign in to mint credits", "warning");
        setLoading(false);
        return;
      }

      const response = await fetch("/api/tokens/mint", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          userId: userId,
          amount: amount,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        addNotification(`${data.error || "Failed to mint credits"}`, "failure");
        setLoading(false);
        return;
      }

      const creditMintLabel = amount === 1 ? "credit" : "credits";
      addNotification(
        `Minted ${amount} ${creditMintLabel} for ${userName}`,
        "success"
      );
      setAmount(10);
      onSuccess?.();
    } catch (error) {
      console.error("Error minting credits:", error);
      addNotification("Network error. Please try again.", "failure");
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        addNotification("Please sign in to remove credits", "warning");
        setLoading(false);
        return;
      }
      const res = await fetch("/api/tokens/remove", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ userId, amount: removeAmount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to remove credits");
      const creditRemoveLabel = removeAmount === 1 ? "credit" : "credits";
      addNotification(
        `Removed ${removeAmount} ${creditRemoveLabel} for ${userName}`,
        "success"
      );
      onSuccess?.();
    } catch (err: any) {
      addNotification(err.message || "Failed to remove credits", "failure");
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setRoleLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        addNotification("Please sign in to change roles", "warning");
        setRoleLoading(false);
        return;
      }

      const response = await fetch(`/api/users/${userId}/role`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          role: role,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        addNotification(`${data.error || "Failed to change role"}`, "failure");
        setRoleLoading(false);
        return;
      }

      addNotification(`Changed role to ${role} for ${userName}`, "success");
      onSuccess?.();
    } catch (error) {
      console.error("Error changing role:", error);
      addNotification("Network error. Please try again.", "failure");
    } finally {
      setRoleLoading(false);
    }
  };

  // Subscription admin functions
  const handleGrantSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        addNotification("Please sign in", "warning");
        setSubLoading(false);
        return;
      }

      const response = await fetch("/api/subscriptions/admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          userId,
          tier: subTier,
          durationDays: subDuration,
          action: "grant",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        addNotification(
          data.error || "Failed to grant subscription",
          "failure"
        );
        return;
      }

      addNotification(
        `Granted ${SUBSCRIPTION_TIERS[subTier].name} subscription for ${subDuration} days`,
        "success"
      );
      onSuccess?.();
    } catch (error) {
      console.error("Error granting subscription:", error);
      addNotification("Network error", "failure");
    } finally {
      setSubLoading(false);
    }
  };

  const handleRevokeSubscription = async () => {
    setSubLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        addNotification("Please sign in", "warning");
        setSubLoading(false);
        return;
      }

      const response = await fetch("/api/subscriptions/admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          userId,
          action: "revoke",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        addNotification(
          data.error || "Failed to revoke subscription",
          "failure"
        );
        return;
      }

      addNotification("Subscription revoked, set to free tier", "success");
      onSuccess?.();
    } catch (error) {
      console.error("Error revoking subscription:", error);
      addNotification("Network error", "failure");
    } finally {
      setSubLoading(false);
    }
  };

  const handleAddCoins = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        addNotification("Please sign in", "warning");
        setSubLoading(false);
        return;
      }

      const response = await fetch("/api/subscriptions/admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          userId,
          coins: subCoins,
          action: "add_coins",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        addNotification(data.error || "Failed to add coins", "failure");
        return;
      }

      addNotification(
        `Added ${subCoins} coins (${data.previousCoins} → ${data.newCoins})`,
        "success"
      );
      onSuccess?.();
    } catch (error) {
      console.error("Error adding coins:", error);
      addNotification("Network error", "failure");
    } finally {
      setSubLoading(false);
    }
  };

  return (
    <div className="bg-linear-to-br from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 rounded-2xl shadow-xl p-6 sm:p-8 border-2 border-red-400 dark:border-red-600">
      <h3 className="text-lg sm:text-xl font-bold mb-6 flex items-center gap-2 text-red-800 dark:text-red-200">
        <DynamicIcon name="Lock" className="w-6 h-6" />
        Admin Controls
      </h3>

      <div className="space-y-6">
        {/* Grant Subscription Section */}
        <div className="bg-white dark:bg-blue-950 rounded-lg p-5 border border-purple-200 dark:border-purple-800">
          <form
            onSubmit={handleGrantSubscription}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-2">
              <label className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <DynamicIcon name="Crown" className="w-4 h-4 text-purple-500" />{" "}
                Grant Subscription:
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">
                    Tier
                  </label>
                  <select
                    value={subTier}
                    onChange={(e) =>
                      setSubTier(e.target.value as SubscriptionTier)
                    }
                    className="w-full px-3 py-2 border-2 border-purple-300 dark:border-purple-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
                    disabled={subLoading}
                  >
                    <option value="starter">Starter ($10/mo)</option>
                    <option value="pro">Pro ($15/mo)</option>
                    <option value="premium">Premium ($30/mo)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">
                    Duration (days)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={subDuration}
                    onChange={(e) =>
                      setSubDuration(parseInt(e.target.value) || 30)
                    }
                    className="w-full px-3 py-2 border-2 border-purple-300 dark:border-purple-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
                    disabled={subLoading}
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Grants {SUBSCRIPTION_TIERS[subTier].weeklyCoins} coins/week +
                BYOK access
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={subLoading}
                className="flex-1 px-4 py-2.5 bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold rounded-lg shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 text-sm"
              >
                {subLoading ? (
                  "Processing..."
                ) : (
                  <>
                    <DynamicIcon name="Gift" className="w-4 h-4" />
                    Grant {SUBSCRIPTION_TIERS[subTier].name}
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleRevokeSubscription}
                disabled={subLoading}
                className="px-4 py-2.5 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 text-sm"
              >
                <DynamicIcon name="X" className="w-4 h-4" />
                Revoke
              </button>
            </div>
          </form>
        </div>

        {/* Add Coins Section */}
        <div className="bg-white dark:bg-blue-950 rounded-lg p-5 border border-yellow-200 dark:border-yellow-800">
          <form onSubmit={handleAddCoins} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <DynamicIcon name="Coins" className="w-4 h-4 text-yellow-500" />{" "}
                Add Weekly Coins:
              </label>
              <input
                type="number"
                value={subCoins}
                onChange={(e) => setSubCoins(parseInt(e.target.value) || 0)}
                className="px-4 py-3 border-2 border-yellow-300 dark:border-yellow-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                disabled={subLoading}
                placeholder="Amount to add (can be negative)"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Adds to current weekly coin balance. Use negative to remove.
              </p>
            </div>
            <button
              type="submit"
              disabled={subLoading || subCoins === 0}
              className="px-6 py-3 bg-linear-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white font-semibold rounded-lg shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {subLoading ? (
                "Processing..."
              ) : (
                <>
                  <DynamicIcon name="Coins" className="w-4 h-4" />
                  {subCoins >= 0
                    ? `Add ${subCoins} Coins`
                    : `Remove ${Math.abs(subCoins)} Coins`}
                </>
              )}
            </button>
          </form>
        </div>

        {/* Divider */}
        <div className="border-t-2 border-red-300 dark:border-red-700"></div>

        {/* Mint Credits Section */}
        <div className="bg-white dark:bg-blue-950 rounded-lg p-5 border border-red-200 dark:border-red-800">
          <form onSubmit={handleMint} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label
                htmlFor="mint-amount"
                className="font-bold text-gray-900 dark:text-white flex items-center gap-2"
              >
                <DynamicIcon name="Coins" className="w-4 h-4" /> Mint Credits:
              </label>
              <input
                id="mint-amount"
                type="number"
                min="1"
                value={amount}
                onChange={(e) => setAmount(parseInt(e.target.value) || 1)}
                className="px-4 py-3 border-2 border-red-300 dark:border-red-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-red-500 dark:focus:border-red-400 focus:ring-2 focus:ring-red-200 dark:focus:ring-red-800 transition-colors"
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              disabled={loading || amount <= 0}
              className="px-6 py-3 bg-linear-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                "Minting..."
              ) : (
                <>
                  <DynamicIcon name="Coins" className="w-4 h-4" />
                  Mint {amount} {amount === 1 ? "Credit" : "Credits"}
                </>
              )}
            </button>
          </form>
        </div>

        {/* Divider */}
        <div className="border-t-2 border-red-300 dark:border-red-700"></div>

        {/* Remove Credits Section */}
        <div className="bg-white dark:bg-blue-950 rounded-lg p-5 border border-red-200 dark:border-red-800">
          <form onSubmit={handleRemove} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label
                htmlFor="remove-amount"
                className="font-bold text-gray-900 dark:text-white flex items-center gap-2"
              >
                <DynamicIcon name="Trash2" className="w-4 h-4" /> Remove
                Credits:
              </label>
              <input
                id="remove-amount"
                type="number"
                min="1"
                value={removeAmount}
                onChange={(e) => setRemoveAmount(parseInt(e.target.value) || 1)}
                className="px-4 py-3 border-2 border-red-300 dark:border-red-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-red-500 dark:focus:border-red-400 focus:ring-2 focus:ring-red-200 dark:focus:ring-red-800 transition-colors"
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              disabled={loading || removeAmount <= 0}
              className="px-6 py-3 bg-linear-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                "Removing..."
              ) : (
                <>
                  <DynamicIcon name="Trash2" className="w-4 h-4" />
                  Remove {removeAmount}{" "}
                  {removeAmount === 1 ? "Credit" : "Credits"}
                </>
              )}
            </button>
          </form>
        </div>

        {/* Change Role Section */}
        <div className="bg-white dark:bg-blue-950 rounded-lg p-5 border border-red-200 dark:border-red-800">
          <form onSubmit={handleRoleChange} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label
                htmlFor="role-select"
                className="font-bold text-gray-900 dark:text-white flex items-center gap-2"
              >
                <DynamicIcon name="User" className="w-4 h-4" /> Change User
                Role:
              </label>
              <select
                id="role-select"
                value={role}
                onChange={(e) =>
                  setRole(e.target.value as "user" | "moderator" | "admin")
                }
                className="px-4 py-3 border-2 border-red-300 dark:border-red-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-red-500 dark:focus:border-red-400 focus:ring-2 focus:ring-red-200 dark:focus:ring-red-800 transition-colors"
                disabled={roleLoading}
              >
                <option value="user">User</option>
                <option value="moderator">Moderator</option>
                <option value="admin">Admin</option>
              </select>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Current role:{" "}
                <span className="font-semibold text-gray-900 dark:text-white">
                  {currentRole || "user"}
                </span>
              </p>
            </div>
            <button
              type="submit"
              disabled={roleLoading || role === currentRole}
              className="px-6 py-3 bg-linear-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {roleLoading ? (
                "Changing..."
              ) : (
                <>
                  <DynamicIcon name="User" className="w-4 h-4" />
                  Change Role
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
