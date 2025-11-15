"use client";

import Image from "next/image";
import { useAuth } from "./misc/AuthContext";
import AuthForm from "./components/AuthForm";
import UserProfile from "./components/UserProfile";

export default function Home() {
  const { user, loading } = useAuth();

  const packages = [
    { name: "Starter", cost: 0.99, tokens: 100, bonus: 0, savings: 0 },
    { name: "Basic", cost: 4.99, tokens: 500, bonus: 50, savings: 8 },
    { name: "Standard", cost: 9.99, tokens: 1000, bonus: 150, savings: 13 },
    { name: "Premium", cost: 19.99, tokens: 2000, bonus: 400, savings: 17 },
    { name: "Ultimate", cost: 49.99, tokens: 5000, bonus: 1500, savings: 23 },
  ];

  return (
    <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-purple-900 dark:to-blue-900 font-sans">
      <main className="flex w-full max-w-6xl flex-col items-center justify-center py-8 px-4 sm:py-12 sm:px-8">
        {/* Hero Section */}
        <div className="text-center mb-8 sm:mb-12">
          <div className="mb-6 flex justify-center">
            <div className="p-4 bg-white dark:bg-gray-800 rounded-2xl shadow-lg">
              <Image
                className="dark:invert"
                src="/next.svg"
                alt="Your Story logo"
                width={120}
                height={24}
                priority
              />
            </div>
          </div>
          
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-4 bg-linear-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
            Your Story Awaits
          </h1>
          
          <p className="max-w-2xl mx-auto text-lg sm:text-xl text-gray-700 dark:text-gray-300 mb-6">
            Dive into AI-powered interactive storytelling where every choice shapes your unique adventure.
            Create, explore, and experience stories that adapt to you.
          </p>

          <div className="flex flex-wrap justify-center gap-4 mb-8">
            <div className="px-6 py-3 bg-white dark:bg-gray-800 rounded-lg shadow-md">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">📗</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Author curated</div>
            </div>
            <div className="px-6 py-3 bg-white dark:bg-gray-800 rounded-lg shadow-md">
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">⚡</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">AI-Powered</div>
            </div>
            <div className="px-6 py-3 bg-white dark:bg-gray-800 rounded-lg shadow-md">
              <div className="text-2xl font-bold text-pink-600 dark:text-pink-400">🎮</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Your Choices</div>
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

        {/* Token Packages Section */}
        <div className="w-full max-w-5xl">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4 text-gray-900 dark:text-white">
            Token Packages
          </h2>
          <p className="text-center text-gray-600 dark:text-gray-400 mb-8 max-w-2xl mx-auto">
            Purchase tokens to generate AI-powered story continuations. Each generation costs 5 tokens.
            Bigger packages offer better value with bonus tokens included!
          </p>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700">
            <table className="w-full text-left">
              <thead className="bg-linear-to-r from-blue-600 to-purple-600 text-white">
                <tr>
                  <th className="px-6 py-4 font-semibold">Package</th>
                  <th className="px-6 py-4 font-semibold">Cost (USD)</th>
                  <th className="px-6 py-4 font-semibold">Tokens</th>
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
                      index === 2 ? "bg-purple-50 dark:bg-purple-900/20 ring-2 ring-purple-500" : ""
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
                      {pkg.tokens.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-green-600 dark:text-green-400 font-semibold">
                      {pkg.bonus > 0 ? `+${pkg.bonus}` : "-"}
                    </td>
                    <td className="px-6 py-4 font-semibold text-gray-900 dark:text-white">
                      {(pkg.tokens + pkg.bonus).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-gray-700 dark:text-gray-300">
                      ${(pkg.cost / (pkg.tokens + pkg.bonus) * 100).toFixed(2)}/100
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
                    <span className="text-gray-600 dark:text-gray-400">Cost:</span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      ${pkg.cost.toFixed(2)}
                    </span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Base Tokens:</span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {pkg.tokens.toLocaleString()}
                    </span>
                  </div>
                  
                  {pkg.bonus > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Bonus:</span>
                      <span className="font-semibold text-green-600 dark:text-green-400">
                        +{pkg.bonus}
                      </span>
                    </div>
                  )}
                  
                  <div className="flex justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
                    <span className="text-gray-600 dark:text-gray-400">Total Tokens:</span>
                    <span className="font-bold text-lg text-gray-900 dark:text-white">
                      {(pkg.tokens + pkg.bonus).toLocaleString()}
                    </span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Rate:</span>
                    <span className="text-gray-900 dark:text-white">
                      ${(pkg.cost / (pkg.tokens + pkg.bonus) * 100).toFixed(2)}/100
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

          {/* Info Note */}
          <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-sm text-blue-900 dark:text-blue-200 text-center">
              💡 <strong>Tip:</strong> Each AI story generation costs 5 tokens. 
              Tokens older than 1 month can be gifted to other users!
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
