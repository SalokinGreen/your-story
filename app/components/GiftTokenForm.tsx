"use client";

import { useState } from "react";
import { supabase } from "@/app/misc/supabase";
import { useNotification } from "@/app/misc/NotificationContext";

interface GiftTokenFormProps {
  recipientId: string;
  recipientEmail: string;
  onSuccess?: () => void;
}

export default function GiftTokenForm({ recipientId, recipientEmail, onSuccess }: GiftTokenFormProps) {
  const { addNotification } = useNotification();
  const [amount, setAmount] = useState(1);
  const [loading, setLoading] = useState(false);

  const handleGift = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        addNotification("Please sign in to gift credits", "warning");
        setLoading(false);
        return;
      }

      const response = await fetch("/api/tokens/gift", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          toUserId: recipientId,
          amount: amount,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        addNotification(`❌ ${data.error || "Failed to gift credits"}`, "failure");
        setLoading(false);
        return;
      }

      const creditLabel = amount === 1 ? "credit" : "credits";
      addNotification(`✓ Gifted ${amount} ${creditLabel} to ${recipientEmail}`, "success");
      setAmount(1);
      onSuccess?.();
    } catch (error) {
      console.error("Error gifting credits:", error);
      addNotification("Network error. Please try again.", "failure");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 sm:p-8 border border-gray-200 dark:border-gray-700">
      <h3 className="text-lg sm:text-xl font-bold mb-6 flex items-center gap-2 text-gray-900 dark:text-white">
        <span className="text-2xl">🎁</span>
        Gift Credits
      </h3>
      <form onSubmit={handleGift} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="amount" className="font-bold text-gray-900 dark:text-white">
            Amount:
          </label>
          <input
            id="amount"
            type="number"
            min="1"
            value={amount}
            onChange={(e) => setAmount(parseInt(e.target.value) || 1)}
            className="px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-purple-500 dark:focus:border-purple-400 focus:ring-2 focus:ring-purple-200 dark:focus:ring-purple-800 transition-colors"
            disabled={loading}
          />
        </div>
        <button
          type="submit"
          disabled={loading || amount <= 0}
          className="px-6 py-3 bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {loading ? "Gifting..." : `🎁 Gift ${amount} ${amount === 1 ? "Credit" : "Credits"}`}
        </button>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Sending to: <span className="font-semibold text-gray-900 dark:text-white">{recipientEmail}</span>
        </p>
      </form>
    </div>
  );
}
