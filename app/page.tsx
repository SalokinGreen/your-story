"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useAuth } from "./misc/AuthContext";
import AuthForm from "./components/AuthForm";
import UserProfile from "./components/UserProfile";
import { Adventure } from "./misc/structs";
import { AI_MODELS, AIModelKey } from "./misc/ai_prices";
import { DynamicIcon } from "./components/DynamicIcon";

// InfoTabs Component
function InfoTabs() {
  const [activeTab, setActiveTab] = useState<"models" | "coins" | "byok">(
    "models"
  );

  const packages = [
    { name: "Starter", cost: 0.99, coins: 100, bonus: 0, savings: 0 },
    { name: "Basic", cost: 4.99, coins: 500, bonus: 50, savings: 8 },
    { name: "Standard", cost: 9.99, coins: 1000, bonus: 150, savings: 13 },
    { name: "Premium", cost: 19.99, coins: 2000, bonus: 400, savings: 17 },
    { name: "Ultimate", cost: 49.99, coins: 5000, bonus: 1500, savings: 23 },
  ];

  return (
    <div className="w-full max-w-5xl mb-12">
      {/* Tab Navigation */}
      <div className="flex justify-center mb-8 px-2">
        <div className="inline-flex flex-wrap justify-center bg-white dark:bg-gray-800 rounded-xl shadow-lg p-1 border border-gray-200 dark:border-gray-700 gap-1">
          <button
            onClick={() => setActiveTab("models")}
            className={`px-3 sm:px-6 py-2 sm:py-3 rounded-lg font-semibold text-sm sm:text-base transition-all flex items-center gap-1 sm:gap-2 whitespace-nowrap ${
              activeTab === "models"
                ? "bg-linear-to-r from-purple-600 to-blue-600 text-white shadow-md"
                : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            }`}
          >
            <DynamicIcon name="Bot" className="w-4 h-4 sm:w-5 sm:h-5" /> AI
            Models
          </button>
          <button
            onClick={() => setActiveTab("coins")}
            className={`px-3 sm:px-6 py-2 sm:py-3 rounded-lg font-semibold text-sm sm:text-base transition-all flex items-center gap-1 sm:gap-2 whitespace-nowrap ${
              activeTab === "coins"
                ? "bg-linear-to-r from-purple-600 to-blue-600 text-white shadow-md"
                : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            }`}
          >
            <DynamicIcon name="Coins" className="w-4 h-4 sm:w-5 sm:h-5" /> Coins
            Packages
          </button>
          <button
            onClick={() => setActiveTab("byok")}
            className={`px-3 sm:px-6 py-2 sm:py-3 rounded-lg font-semibold text-sm sm:text-base transition-all flex items-center gap-1 sm:gap-2 whitespace-nowrap ${
              activeTab === "byok"
                ? "bg-linear-to-r from-purple-600 to-blue-600 text-white shadow-md"
                : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            }`}
          >
            <DynamicIcon name="Key" className="w-4 h-4 sm:w-5 sm:h-5" /> BYOK
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="animate-fadeIn">
        {activeTab === "models" && (
          <div>
            <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4 text-gray-900 dark:text-white flex items-center justify-center gap-2">
              <DynamicIcon name="Bot" className="w-8 h-8" /> AI Models
            </h2>
            <p className="text-center text-gray-600 dark:text-gray-400 mb-8 max-w-2xl mx-auto">
              Choose from our curated selection of AI models, each with unique
              strengths and characteristics for your storytelling needs.
            </p>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Object.entries(AI_MODELS).map(([key, model]) => (
                <div
                  key={key}
                  className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:scale-105 transition-transform"
                >
                  <div className="bg-linear-to-r from-purple-600 to-blue-600 p-4 text-white">
                    <h3 className="text-2xl font-bold mb-1">{model.name}</h3>
                    <p className="text-sm text-purple-100">
                      {model.original_model}
                    </p>
                  </div>
                  <div className="p-6 space-y-4">
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                      {model.description}
                    </p>
                    <div className="flex justify-between items-center text-sm">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                          {model.cost}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          Coins/Gen
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                          {(model.maxTokens / 1000).toFixed(0)}K
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          Max Tokens
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase">
                        Strengths
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {model.strengths.map((strength, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-xs font-semibold flex items-center gap-1"
                          >
                            <DynamicIcon name="Check" className="w-3 h-3" />{" "}
                            {strength}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase">
                        Weaknesses
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {model.weaknesses.map((weakness, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded-full text-xs font-semibold flex items-center gap-1"
                          >
                            <DynamicIcon
                              name="AlertTriangle"
                              className="w-3 h-3"
                            />{" "}
                            {weakness}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
              <p className="text-sm text-purple-900 dark:text-purple-200 text-center flex items-center justify-center gap-2">
                <DynamicIcon name="Lightbulb" className="w-4 h-4" />{" "}
                <strong>Pro Tip:</strong> You can select your preferred AI model
                in the story menu during gameplay. Each model offers unique
                storytelling characteristics!
              </p>
            </div>
            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-sm text-blue-900 dark:text-blue-200 text-center flex items-center justify-center gap-2">
                <DynamicIcon name="Mic" className="w-4 h-4" />{" "}
                <strong>Text-to-Speech:</strong> Each TTS generation costs 3
                coins and runs through Speechify for high-quality voice
                narration.
              </p>
            </div>
          </div>
        )}

        {activeTab === "coins" && (
          <div>
            <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4 text-gray-900 dark:text-white flex items-center justify-center gap-2">
              <DynamicIcon name="Coins" className="w-8 h-8" /> Coins Packages
            </h2>
            <p className="text-center text-gray-600 dark:text-gray-400 mb-8 max-w-2xl mx-auto">
              Purchase coins to generate AI-powered story continuations. Each
              generation costs 1 coin. Bigger packages offer better value with
              bonus coins included!
            </p>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700">
              <table className="w-full text-left">
                <thead className="bg-linear-to-r from-blue-600 to-purple-600 text-white">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Package</th>
                    <th className="px-6 py-4 font-semibold">Cost (USD)</th>
                    <th className="px-6 py-4 font-semibold">Coins</th>
                    <th className="px-6 py-4 font-semibold">Bonus</th>
                    <th className="px-6 py-4 font-semibold">Total</th>
                    <th className="px-6 py-4 font-semibold">Effective Rate</th>
                    <th className="px-6 py-4 font-semibold">Savings</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {packages.map((pkg, index) => (
                    <tr
                      key={pkg.name}
                      className={`hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                        index === 2
                          ? "bg-purple-50 dark:bg-purple-900/20 ring-2 ring-purple-500"
                          : ""
                      }`}
                    >
                      <td className="px-6 py-4 font-semibold text-gray-900 dark:text-white">
                        {pkg.name}
                        {index === 2 && (
                          <span className="ml-2 px-2 py-1 text-xs bg-purple-600 text-white rounded-full">
                            POPULAR
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-gray-700 dark:text-gray-300">
                        ${pkg.cost.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-gray-700 dark:text-gray-300">
                        {pkg.coins.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-green-600 dark:text-green-400 font-semibold">
                        {pkg.bonus > 0 ? `+${pkg.bonus}` : "-"}
                      </td>
                      <td className="px-6 py-4 font-semibold text-gray-900 dark:text-white">
                        {(pkg.coins + pkg.bonus).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-gray-700 dark:text-gray-300">
                        $
                        {((pkg.cost / (pkg.coins + pkg.bonus)) * 100).toFixed(
                          2
                        )}
                        /100
                      </td>
                      <td className="px-6 py-4">
                        {pkg.savings > 0 ? (
                          <span className="px-3 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-full text-sm font-semibold">
                            {pkg.savings}%
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden grid gap-4">
              {packages.map((pkg, index) => (
                <div
                  key={pkg.name}
                  className={`bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border-2 ${
                    index === 2
                      ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
                      : "border-gray-200 dark:border-gray-700"
                  }`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                      {pkg.name}
                    </h3>
                    {index === 2 && (
                      <span className="px-3 py-1 text-xs bg-purple-600 text-white rounded-full font-semibold">
                        POPULAR
                      </span>
                    )}
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">
                        Cost:
                      </span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        ${pkg.cost.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">
                        Base Coins:
                      </span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {pkg.coins.toLocaleString()}
                      </span>
                    </div>
                    {pkg.bonus > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">
                          Bonus:
                        </span>
                        <span className="font-semibold text-green-600 dark:text-green-400">
                          +{pkg.bonus}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
                      <span className="text-gray-600 dark:text-gray-400">
                        Total Coins:
                      </span>
                      <span className="font-bold text-lg text-gray-900 dark:text-white">
                        {(pkg.coins + pkg.bonus).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">
                        Rate:
                      </span>
                      <span className="text-gray-900 dark:text-white">
                        $
                        {((pkg.cost / (pkg.coins + pkg.bonus)) * 100).toFixed(
                          2
                        )}
                        /100
                      </span>
                    </div>
                    {pkg.savings > 0 && (
                      <div className="flex justify-center pt-2">
                        <span className="px-4 py-2 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-full text-sm font-semibold">
                          Save {pkg.savings}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-sm text-blue-900 dark:text-blue-200 text-center">
                <DynamicIcon
                  name="Lightbulb"
                  className="inline-block w-4 h-4 mr-1 text-blue-600"
                />
                <strong>Tip:</strong> Each AI story generation costs 1 Coin.
                Coins older than 1 month can be gifted to other users!
              </p>
            </div>
          </div>
        )}

        {activeTab === "byok" && (
          <div>
            <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4 text-gray-900 dark:text-white flex items-center justify-center gap-2">
              <DynamicIcon name="Key" className="w-8 h-8" /> Bring Your Own Key
              (BYOK)
            </h2>
            <p className="text-center text-gray-600 dark:text-gray-400 mb-8 max-w-2xl mx-auto">
              Take full control of your AI experience. Use your own API keys
              with unlimited flexibility and customize every aspect of content
              generation.
            </p>

            <div className="bg-linear-to-br from-indigo-50 via-purple-50 to-pink-50 dark:from-indigo-950 dark:via-purple-950 dark:to-pink-950 rounded-2xl shadow-2xl border-2 border-indigo-300 dark:border-indigo-700 overflow-hidden">
              <div className="bg-linear-to-r from-indigo-600 via-purple-600 to-pink-600 p-8 text-white text-center">
                <div className="text-5xl mb-4 flex justify-center">
                  <DynamicIcon name="Rocket" className="w-16 h-16" />
                </div>
                <h3 className="text-3xl sm:text-4xl font-bold mb-2">
                  Premium BYOK Subscription
                </h3>
                <div className="text-4xl sm:text-5xl font-extrabold mb-2">
                  $10<span className="text-2xl font-normal">/month</span>
                </div>
                <p className="text-indigo-100 text-lg">
                  Unlimited AI generations with your own keys
                </p>
              </div>

              <div className="p-8 sm:p-12">
                <div className="grid md:grid-cols-2 gap-6 mb-8">
                  <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="text-3xl">
                        <DynamicIcon name="Bot" className="w-8 h-8" />
                      </div>
                      <h4 className="text-xl font-bold text-gray-900 dark:text-white">
                        OpenRouter Integration
                      </h4>
                    </div>
                    <ul className="space-y-3">
                      <li className="flex items-start gap-2">
                        <span className="text-green-500 font-bold mt-1">
                          <DynamicIcon name="Check" className="w-4 h-4" />
                        </span>
                        <span className="text-gray-700 dark:text-gray-300">
                          Use your own OpenRouter API key
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-green-500 font-bold mt-1">
                          <DynamicIcon name="Check" className="w-4 h-4" />
                        </span>
                        <span className="text-gray-700 dark:text-gray-300">
                          Choose from <strong>100+ AI models</strong>
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-green-500 font-bold mt-1">
                          <DynamicIcon name="Check" className="w-4 h-4" />
                        </span>
                        <span className="text-gray-700 dark:text-gray-300">
                          Customize <strong>context window size</strong>
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-green-500 font-bold mt-1">
                          <DynamicIcon name="Check" className="w-4 h-4" />
                        </span>
                        <span className="text-gray-700 dark:text-gray-300">
                          Full model parameter control
                        </span>
                      </li>
                    </ul>
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="text-3xl">
                        <DynamicIcon name="Mic" className="w-8 h-8" />
                      </div>
                      <h4 className="text-xl font-bold text-gray-900 dark:text-white">
                        Speechify TTS
                      </h4>
                    </div>
                    <ul className="space-y-3">
                      <li className="flex items-start gap-2">
                        <span className="text-green-500 font-bold mt-1">
                          <DynamicIcon name="Check" className="w-4 h-4" />
                        </span>
                        <span className="text-gray-700 dark:text-gray-300">
                          Use your own Speechify API key
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-green-500 font-bold mt-1">
                          <DynamicIcon name="Check" className="w-4 h-4" />
                        </span>
                        <span className="text-gray-700 dark:text-gray-300">
                          <strong>Unlimited</strong> text-to-speech generations
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-green-500 font-bold mt-1">
                          <DynamicIcon name="Check" className="w-4 h-4" />
                        </span>
                        <span className="text-gray-700 dark:text-gray-300">
                          Premium voice library access
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-green-500 font-bold mt-1">
                          <DynamicIcon name="Check" className="w-4 h-4" />
                        </span>
                        <span className="text-gray-700 dark:text-gray-300">
                          No per-generation fees
                        </span>
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="bg-linear-to-r from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 rounded-xl p-6 mb-6">
                  <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-4 text-center flex items-center justify-center gap-2">
                    <DynamicIcon name="Sparkles" className="w-5 h-5" />{" "}
                    Additional Benefits
                  </h4>
                  <div className="grid sm:grid-cols-2 gap-4 text-center">
                    <div className="flex flex-col items-center">
                      <div className="text-2xl mb-2">
                        <DynamicIcon name="Coins" className="w-8 h-8" />
                      </div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        Pay-as-you-go pricing
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        Only pay for what you use
                      </p>
                    </div>
                    <div className="flex flex-col items-center">
                      <div className="text-2xl mb-2">
                        <DynamicIcon name="Lock" className="w-8 h-8" />
                      </div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        Your keys, your data
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        Complete privacy & control
                      </p>
                    </div>
                  </div>
                </div>

                <div className="text-center">
                  <button
                    className="px-8 py-4 bg-linear-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-700 hover:via-purple-700 hover:to-pink-700 text-white font-bold text-lg rounded-xl shadow-xl hover:shadow-2xl transition-all transform hover:scale-105"
                    disabled
                  >
                    Subscribe to BYOK - $10/month
                  </button>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-4">
                    Coming Soon • Cancel anytime • No hidden fees • Full refund
                    within 7 days
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
              <p className="text-sm text-purple-900 dark:text-purple-200 text-center flex items-center justify-center gap-2">
                <DynamicIcon name="Lightbulb" className="w-4 h-4" />{" "}
                <strong>Perfect for power users:</strong> With BYOK, you control
                your AI budget directly through OpenRouter and Speechify. No
                coin limits, just pure flexibility!
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [popularToday, setPopularToday] = useState<Adventure[]>([]);
  const [loadingPopular, setLoadingPopular] = useState(true);
  const [roadmapIndex, setRoadmapIndex] = useState(() => {
    // Start at first wip/planned goal, or last item if all done
    const firstIncomplete = road_map.findIndex(
      (item) => item.status !== "done"
    );
    return firstIncomplete === -1 ? road_map.length - 1 : firstIncomplete;
  });

  // Keyboard navigation for roadmap
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        setRoadmapIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === "ArrowRight") {
        setRoadmapIndex((prev) => Math.min(road_map.length - 1, prev + 1));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Fetch top 3 most popular adventures
  useEffect(() => {
    const fetchPopular = async () => {
      try {
        const response = await fetch(
          "/api/adventures?sortBy=popularity&limit=3"
        );
        if (!response.ok) throw new Error("Failed to fetch");

        const { adventures } = await response.json();
        setPopularToday(adventures);
      } catch (error) {
        console.error("Error fetching popular adventures:", error);
      } finally {
        setLoadingPopular(false);
      }
    };

    fetchPopular();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-purple-900 dark:to-blue-900 font-sans">
      <main className="flex w-full max-w-6xl flex-col items-center justify-center py-8 px-4 sm:py-12 sm:px-8">
        {/* Hero Section */}
        <div className="text-center mb-8 sm:mb-12">
          <div className="mb-6 flex justify-center"></div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-4 bg-linear-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
            Your Story Awaits
          </h1>

          <p className="max-w-2xl mx-auto text-lg sm:text-xl text-gray-700 dark:text-gray-300 mb-6">
            Dive into AI-powered interactive storytelling where every choice
            shapes your unique adventure. Create, explore, and experience
            stories that adapt to you.
          </p>

          <div className="flex flex-wrap justify-center gap-4 mb-8">
            <div className="px-6 py-3 bg-white dark:bg-gray-800 rounded-lg shadow-md flex items-center gap-2">
              <div className="text-blue-600 dark:text-blue-400">
                <DynamicIcon name="BookOpen" className="w-6 h-6" />
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 font-semibold">
                Author curated
              </div>
            </div>
            <div className="px-6 py-3 bg-white dark:bg-gray-800 rounded-lg shadow-md flex items-center gap-2">
              <div className="text-purple-600 dark:text-purple-400">
                <DynamicIcon name="Zap" className="w-6 h-6" />
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 font-semibold">
                AI-Powered
              </div>
            </div>
            <div className="px-6 py-3 bg-white dark:bg-gray-800 rounded-lg shadow-md flex items-center gap-2">
              <div className="text-pink-600 dark:text-pink-400">
                <DynamicIcon name="Gamepad2" className="w-6 h-6" />
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 font-semibold">
                Your Choices
              </div>
            </div>
          </div>
        </div>

        {/* Auth Section */}
        {!loading && (
          <div className="w-full max-w-md mb-12">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 sm:p-8 border border-gray-200 dark:border-gray-700">
              {user ? <UserProfile /> : <AuthForm />}
            </div>
          </div>
        )}

        {/* Popular Today Section */}
        <div className="w-full max-w-5xl mb-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <DynamicIcon name="Flame" className="w-8 h-8 text-orange-500" />{" "}
              Popular Today
            </h2>
            <button
              onClick={() => router.push("/explorer")}
              className="px-6 py-3 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all"
            >
              Browse All Adventures →
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {loadingPopular ? (
              Array(3)
                .fill(0)
                .map((_, i) => (
                  <div
                    key={i}
                    className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-pulse"
                  >
                    <div className="h-48 bg-gray-300 dark:bg-gray-700"></div>
                    <div className="p-6 space-y-3">
                      <div className="h-6 bg-gray-300 dark:bg-gray-700 rounded w-3/4"></div>
                      <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded"></div>
                      <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-5/6"></div>
                    </div>
                  </div>
                ))
            ) : popularToday.length === 0 ? (
              <div className="col-span-3 text-center py-12 text-gray-600 dark:text-gray-400">
                No adventures available yet. Be the first to create one!
              </div>
            ) : (
              popularToday.map((adventure, index) => (
                <div
                  key={adventure.id}
                  onClick={() => router.push(`/explorer/${adventure.id}`)}
                  className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden cursor-pointer hover:scale-105 transition-transform"
                >
                  {/* Thumbnail with fallback to gradient */}
                  {adventure.thumbnailUrl ? (
                    <div className="h-48 relative overflow-hidden">
                      <Image
                        src={adventure.thumbnailUrl}
                        alt={adventure.title}
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 33vw, 400px"
                      />
                    </div>
                  ) : (
                    <div
                      className={`h-48 bg-linear-to-br ${
                        index === 0
                          ? "from-blue-400 to-purple-600"
                          : index === 1
                          ? "from-purple-400 to-pink-600"
                          : "from-pink-400 to-red-600"
                      } flex items-center justify-center`}
                    >
                      <div className="text-white">
                        {index === 0 ? (
                          <DynamicIcon name="Ghost" className="w-16 h-16" />
                        ) : index === 1 ? (
                          <DynamicIcon name="Bot" className="w-16 h-16" />
                        ) : (
                          <DynamicIcon name="Sparkles" className="w-16 h-16" />
                        )}
                      </div>
                    </div>
                  )}

                  <div className="p-6">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white line-clamp-1">
                        {adventure.title}
                      </h3>
                      <span className="text-yellow-500 text-sm font-semibold whitespace-nowrap ml-2 flex items-center gap-1">
                        <DynamicIcon
                          name="Star"
                          className="w-4 h-4 fill-current"
                        />{" "}
                        {adventure.rating?.toFixed(1) || "N/A"}
                      </span>
                    </div>

                    <p className="text-gray-600 dark:text-gray-400 text-sm mb-4 line-clamp-2">
                      {adventure.shortDescription}
                    </p>

                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-3">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-semibold capitalize ${
                            adventure.difficulty.toLowerCase() === "easy"
                              ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                              : adventure.difficulty.toLowerCase() === "medium"
                              ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300"
                              : adventure.difficulty.toLowerCase() === "hard"
                              ? "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300"
                              : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
                          }`}
                        >
                          {adventure.difficulty}
                        </span>
                        <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1">
                          <DynamicIcon name="Gamepad2" className="w-3 h-3" />
                          {adventure.playCount >= 1000
                            ? `${(adventure.playCount / 1000).toFixed(1)}k`
                            : adventure.playCount}{" "}
                          plays
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 mt-4">
                      {adventure.tags.slice(0, 2).map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-xs"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* CTA Button for Mobile */}
          <div className="mt-8 flex justify-center md:hidden">
            <button
              onClick={() => router.push("/explorer")}
              className="w-full max-w-md px-6 py-4 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold rounded-lg shadow-lg hover:shadow-xl transition-all text-lg"
            >
              Browse All Adventures →
            </button>
          </div>
        </div>

        {/* Tabbed Info Section */}
        <InfoTabs />

        {/* Roadmap Carousel Section */}
        <div className="w-full max-w-5xl mt-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-8 text-gray-900 dark:text-white flex items-center justify-center gap-2">
            <DynamicIcon name="Map" className="w-8 h-8" /> Project Roadmap
          </h2>

          <div className="relative">
            {/* Carousel Container */}
            <div className="overflow-hidden">
              <div
                className="flex transition-transform duration-500 ease-out"
                style={{
                  transform: `translateX(-${roadmapIndex * 100}%)`,
                }}
              >
                {road_map.map((milestone, index) => (
                  <div key={index} className="w-full shrink-0 px-4">
                    <div
                      className={`mx-auto max-w-2xl bg-white dark:bg-gray-800 rounded-2xl shadow-xl border-2 overflow-hidden transition-all ${
                        milestone.status === "done"
                          ? "border-green-500 dark:border-green-400"
                          : milestone.status === "wip"
                          ? "border-blue-500 dark:border-blue-400"
                          : "border-gray-400 dark:border-gray-600"
                      }`}
                    >
                      {/* Optional Banner */}
                      {milestone.bannerUrl && (
                        <div className="h-32 sm:h-40 relative overflow-hidden">
                          <Image
                            src={milestone.bannerUrl}
                            alt={milestone.title}
                            fill
                            className="object-cover"
                            sizes="(max-width: 768px) 100vw, 672px"
                          />
                        </div>
                      )}

                      <div className="p-8">
                        {/* Status Badge */}
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div
                              className={`text-3xl ${
                                milestone.status === "done"
                                  ? "text-green-500"
                                  : milestone.status === "wip"
                                  ? "text-blue-500"
                                  : "text-gray-400"
                              }`}
                            >
                              {milestone.status === "done" ? (
                                <DynamicIcon
                                  name="CheckCircle"
                                  className="w-8 h-8"
                                />
                              ) : milestone.status === "wip" ? (
                                <DynamicIcon
                                  name="Construction"
                                  className="w-8 h-8"
                                />
                              ) : (
                                <DynamicIcon
                                  name="ClipboardList"
                                  className="w-8 h-8"
                                />
                              )}
                            </div>
                            <span
                              className={`px-3 py-1 rounded-full text-sm font-semibold ${
                                milestone.status === "done"
                                  ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                                  : milestone.status === "wip"
                                  ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                                  : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                              }`}
                            >
                              {milestone.status === "done"
                                ? "Completed"
                                : milestone.status === "wip"
                                ? "Work In Progress"
                                : "Planned"}
                            </span>
                          </div>
                          <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                            {index + 1} / {road_map.length}
                          </span>
                        </div>

                        {/* Title */}
                        <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-4">
                          {milestone.title}
                        </h3>

                        {/* Description */}
                        <p className="text-gray-700 dark:text-gray-300 text-base sm:text-lg leading-relaxed">
                          {milestone.description}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Navigation Buttons */}
            <div className="flex items-center justify-center gap-2 sm:gap-4 mt-8 px-2">
              <button
                onClick={() => setRoadmapIndex((prev) => Math.max(0, prev - 1))}
                disabled={roadmapIndex === 0}
                className={`px-3 sm:px-6 py-2 sm:py-3 rounded-lg font-semibold text-sm sm:text-base transition-all shadow-md ${
                  roadmapIndex === 0
                    ? "bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-500 cursor-not-allowed"
                    : "bg-purple-600 hover:bg-purple-700 text-white hover:shadow-lg"
                }`}
              >
                ← Previous
              </button>

              {/* Progress Dots */}
              <div className="flex gap-2">
                {road_map.map((milestone, index) => (
                  <button
                    key={index}
                    onClick={() => setRoadmapIndex(index)}
                    className={`transition-all ${
                      index === roadmapIndex
                        ? "w-8 h-3 rounded-full"
                        : "w-3 h-3 rounded-full"
                    } ${
                      milestone.status === "done"
                        ? index === roadmapIndex
                          ? "bg-green-600 dark:bg-green-400"
                          : "bg-green-400 dark:bg-green-600"
                        : milestone.status === "wip"
                        ? index === roadmapIndex
                          ? "bg-blue-600 dark:bg-blue-400"
                          : "bg-blue-400 dark:bg-blue-600"
                        : index === roadmapIndex
                        ? "bg-gray-600 dark:bg-gray-400"
                        : "bg-gray-300 dark:bg-gray-600"
                    }`}
                    aria-label={`Go to ${milestone.title}`}
                  />
                ))}
              </div>

              <button
                onClick={() =>
                  setRoadmapIndex((prev) =>
                    Math.min(road_map.length - 1, prev + 1)
                  )
                }
                disabled={roadmapIndex === road_map.length - 1}
                className={`px-3 sm:px-6 py-2 sm:py-3 rounded-lg font-semibold text-sm sm:text-base transition-all shadow-md ${
                  roadmapIndex === road_map.length - 1
                    ? "bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-500 cursor-not-allowed"
                    : "bg-purple-600 hover:bg-purple-700 text-white hover:shadow-lg"
                }`}
              >
                Next →
              </button>
            </div>

            {/* Keyboard Navigation Hint */}
            <div className="text-center mt-6">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                <DynamicIcon
                  name="Lightbulb"
                  className="inline-block w-3 h-3 mr-1"
                />
                Tip: Use arrow keys to navigate
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

const road_map = [
  {
    title: "Barebones ",
    description: "Initial mvp with core features for AI storytelling.",
    status: "done" as const,
    bannerUrl: undefined,
  },
  {
    title: "Alpha Release and Testers",
    description:
      "I'm still looking for people to test the alpha version of the app. If you're interested, please reach out to me on Discord @SGreen",
    status: "wip" as const,
    bannerUrl: undefined,
  },
  {
    title: "Donations",
    description:
      "Adding ways for people who believe in the project to support it financially.",
    status: "wip" as const,
    bannerUrl: undefined,
  },
  {
    title: "Payment and BYOK Subscriptions",
    description:
      "Implementing payment processing for buying coins and subscriptions for Bring Your Own Key (BYOK) users.",
    status: "wip" as const,
    bannerUrl: undefined,
  },
  {
    title: "Multiplayer Adventures",
    description:
      "Enabling multiple users to participate in the same adventure together. Play with friends, share the burden, and make collective choices.",
    status: "planned" as const,
    bannerUrl: undefined,
  },
  {
    title: "Finetuning",
    description:
      "Bringing to you in-house baked models for an enriched storytelling experience.",
    status: "planned" as const,
    bannerUrl: undefined,
  },
  {
    title: "Ads for Coins",
    description:
      "Implementing ads that users can watch to earn free coins. We need a decent daily active user base for this to be viable.",
    status: "planned" as const,
    bannerUrl: undefined,
  },
  {
    title: "Free Trials",
    description:
      "Offering free trial periods for users to experience the game without paying.",
    status: "planned" as const,
    bannerUrl: undefined,
  },
];
