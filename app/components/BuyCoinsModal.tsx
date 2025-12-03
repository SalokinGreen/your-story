"use client";

import { useState } from "react";
import { useSubscription } from "../misc/SubscriptionContext";
import { StaticIcon } from "./StaticIcon";

interface BuyCoinsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Visual styles for each package tier
const PACKAGE_STYLES = [
  {
    gradient: "from-slate-600 to-slate-700",
    ring: "ring-slate-500/30",
    icon: "Coins",
  },
  {
    gradient: "from-blue-600 to-blue-700",
    ring: "ring-blue-500/30",
    icon: "Sparkles",
  },
  {
    gradient: "from-purple-600 to-purple-700",
    ring: "ring-purple-500/30",
    icon: "Zap",
  },
  {
    gradient: "from-amber-500 to-orange-600",
    ring: "ring-amber-500/30",
    icon: "Crown",
  },
];

/**
 * Modal for purchasing coin packages (available to paid subscribers only)
 */
export default function BuyCoinsModal({ isOpen, onClose }: BuyCoinsModalProps) {
  const { coinPackages, purchaseCoins, canBuyCoins, tier } = useSubscription();
  const [loading, setLoading] = useState<string | null>(null);
  const [hoveredPkg, setHoveredPkg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handlePurchase = async (packageId: string) => {
    setLoading(packageId);
    try {
      await purchaseCoins(packageId);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-100 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-linear-to-b from-slate-900 to-slate-950 border border-blue-500/20 rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl shadow-blue-500/10">
        {/* Header */}
        <div className="relative p-6 pb-4 text-center">
          {/* Decorative glow */}
          <div className="absolute inset-x-0 top-0 h-32 bg-linear-to-b from-yellow-500/10 to-transparent rounded-t-2xl" />

          <div className="relative">
            <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-linear-to-br from-yellow-400 to-amber-600 flex items-center justify-center shadow-lg shadow-yellow-500/30">
              <StaticIcon name="Coins" className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-1">Buy Coins</h2>
            <p className="text-blue-200/60 text-sm">
              Power up your storytelling with extra coins
            </p>
          </div>

          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
          >
            <StaticIcon name="X" className="w-4 h-4 text-blue-200/60" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 pt-2">
          {!canBuyCoins ? (
            <div className="text-center py-8">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-blue-500/10 flex items-center justify-center">
                <StaticIcon
                  name="Lock"
                  className="w-10 h-10 text-blue-200/40"
                />
              </div>
              <p className="text-blue-200/70 mb-2 font-medium">
                Unlock Coin Purchases
              </p>
              <p className="text-sm text-blue-200/50 max-w-xs mx-auto">
                {tier === "free"
                  ? "Subscribe to any paid plan to buy additional coins whenever you need them."
                  : "Your subscription needs to be active to purchase coins."}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                {coinPackages.map((pkg, index) => {
                  const style = PACKAGE_STYLES[index] || PACKAGE_STYLES[0];
                  const isHovered = hoveredPkg === pkg.id;
                  const isLoading = loading === pkg.id;
                  const isPopular = index === 2; // 2,500 coins is "popular"

                  return (
                    <button
                      key={pkg.id}
                      onClick={() => handlePurchase(pkg.id)}
                      onMouseEnter={() => setHoveredPkg(pkg.id)}
                      onMouseLeave={() => setHoveredPkg(null)}
                      disabled={loading !== null}
                      className={`relative group rounded-xl overflow-hidden transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed ${
                        isHovered ? "scale-[1.02] shadow-xl" : "shadow-lg"
                      } ${isPopular ? "ring-2 ring-purple-500/50" : ""}`}
                    >
                      {/* Background gradient */}
                      <div
                        className={`absolute inset-0 bg-linear-to-br ${style.gradient} opacity-90`}
                      />

                      {/* Shine effect on hover */}
                      <div
                        className={`absolute inset-0 bg-linear-to-tr from-white/0 via-white/10 to-white/0 transition-opacity duration-300 ${
                          isHovered ? "opacity-100" : "opacity-0"
                        }`}
                      />

                      {/* Popular badge */}
                      {isPopular && (
                        <div className="absolute top-0 left-0 right-0 bg-purple-500 text-white text-[10px] font-bold py-1 text-center uppercase tracking-wider">
                          Best Value
                        </div>
                      )}

                      {/* Bonus badge */}
                      {pkg.bonusPercent > 0 && !isPopular && (
                        <div className="absolute -top-1 -right-1 bg-green-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-bl-lg rounded-tr-xl shadow-lg">
                          +{pkg.bonusPercent}%
                        </div>
                      )}

                      <div
                        className={`relative p-5 ${isPopular ? "pt-8" : ""}`}
                      >
                        {/* Icon */}
                        <div
                          className={`w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center mb-3 transition-transform duration-300 ${
                            isHovered ? "scale-110" : ""
                          }`}
                        >
                          <StaticIcon
                            name={style.icon}
                            className="w-5 h-5 text-white"
                          />
                        </div>

                        {/* Coins amount */}
                        <div className="mb-3">
                          <div className="flex items-baseline gap-1">
                            <span className="text-3xl font-bold text-white">
                              {pkg.coins.toLocaleString()}
                            </span>
                            <span className="text-white/50 text-sm font-medium">
                              coins
                            </span>
                            {pkg.bonusPercent > 0 && isPopular && (
                              <span className="text-xs font-medium text-green-300 bg-green-500/20 px-1.5 py-0.5 rounded ml-1">
                                +{pkg.bonusPercent}%
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Price */}
                        <div className="flex items-end justify-between">
                          <div>
                            <span className="text-2xl font-bold text-white">
                              ${pkg.price}
                            </span>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] text-white/40">
                              ${((pkg.price / pkg.coins) * 100).toFixed(2)}/100
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Loading overlay */}
                      {isLoading && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                          <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-center gap-6 text-xs text-blue-200/40">
                <span className="flex items-center gap-1.5">
                  <StaticIcon name="Zap" className="w-3.5 h-3.5" />
                  Instant delivery
                </span>
                <span className="flex items-center gap-1.5">
                  <StaticIcon name="Shield" className="w-3.5 h-3.5" />
                  Secure payment
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
