"use client";

import { TokenBalance } from "@/app/misc/tokens";
import { DynamicIcon } from "./DynamicIcon";

interface TokenBalanceDisplayProps {
  balance: TokenBalance;
  loading?: boolean;
}

export default function TokenBalanceDisplay({
  balance,
  loading,
}: TokenBalanceDisplayProps) {
  if (loading) {
    return (
      <div className="bg-white dark:bg-blue-950 rounded-2xl shadow-xl p-6 sm:p-8 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg sm:text-xl font-bold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
          <DynamicIcon name="Coins" className="w-6 h-6 text-yellow-500" />{" "}
          Credit Balance
        </h3>
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-3/4"></div>
          <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-1/2"></div>
          <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-blue-950 rounded-2xl shadow-xl p-6 sm:p-8 border border-gray-200 dark:border-gray-700">
      <h3 className="text-lg sm:text-xl font-bold mb-6 flex items-center gap-2 text-gray-900 dark:text-white">
        <DynamicIcon name="Coins" className="w-6 h-6 text-yellow-500" />
        Credit Balance
      </h3>
      <div className="space-y-4">
        <div className="flex justify-between items-center p-4 rounded-lg bg-linear-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border border-blue-200 dark:border-blue-800">
          <span className="font-bold text-gray-900 dark:text-white">
            Total Credits:
          </span>
          <span className="text-2xl font-bold bg-linear-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            {balance.total}
          </span>
        </div>
        <div className="flex justify-between items-center p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
          <span className="font-bold text-gray-900 dark:text-white">
            Tradable:
          </span>
          <span className="text-2xl font-bold text-green-600 dark:text-green-400">
            {balance.tradable}
          </span>
        </div>
        <div className="flex justify-between items-center p-4 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
          <span className="font-bold text-gray-900 dark:text-white">
            Locked:
          </span>
          <span className="text-2xl font-bold text-orange-600 dark:text-orange-400">
            {balance.locked}
          </span>
        </div>
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
            <DynamicIcon name="Lightbulb" className="w-4 h-4 text-yellow-500" />{" "}
            <strong>Tip:</strong> Credits become tradable 1 month after
            receiving them
          </p>
        </div>
      </div>
    </div>
  );
}
