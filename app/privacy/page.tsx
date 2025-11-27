"use client";

import { useRouter } from "next/navigation";
import { DynamicIcon } from "../components/DynamicIcon";

export default function PrivacyPolicy() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-900 via-blue-950 to-purple-950">
      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-blue-200/60 hover:text-blue-200 transition-colors mb-4"
          >
            <DynamicIcon name="ArrowLeft" className="w-4 h-4" />
            Back
          </button>
          <h1 className="text-3xl font-bold text-white mb-2">Privacy Policy</h1>
          <p className="text-blue-200/40 text-sm">
            Last updated: November 27, 2025
          </p>
        </div>

        {/* Content */}
        <div className="space-y-8 text-blue-200/80">
          {/* Introduction */}
          <section className="bg-blue-950/30 rounded-xl border border-blue-800/30 p-6">
            <h2 className="text-xl font-semibold text-white mb-3 flex items-center gap-2">
              <DynamicIcon name="Shield" className="w-5 h-5 text-blue-400" />
              Your Privacy Matters
            </h2>
            <p className="leading-relaxed">
              At Your Story, we believe your creative content belongs to you.
              We&apos;ve designed our platform with privacy as a core principle.
              This policy explains how we handle your data in plain, simple
              terms.
            </p>
          </section>

          {/* Stories & Content */}
          <section className="bg-blue-950/30 rounded-xl border border-blue-800/30 p-6">
            <h2 className="text-xl font-semibold text-white mb-3 flex items-center gap-2">
              <DynamicIcon
                name="BookOpen"
                className="w-5 h-5 text-purple-400"
              />
              Your Stories & Content
            </h2>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <DynamicIcon
                  name="Check"
                  className="w-5 h-5 text-green-400 shrink-0 mt-0.5"
                />
                <div>
                  <h3 className="font-medium text-white">
                    You own your stories
                  </h3>
                  <p className="text-sm text-blue-200/60">
                    All stories you create remain your property. We don&apos;t
                    claim any ownership over your creative content.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <DynamicIcon
                  name="Check"
                  className="w-5 h-5 text-green-400 shrink-0 mt-0.5"
                />
                <div>
                  <h3 className="font-medium text-white">
                    Stories are stored until you delete them
                  </h3>
                  <p className="text-sm text-blue-200/60">
                    Your stories persist in our database so you can access them
                    anytime. When you delete a story, it&apos;s permanently
                    removed from our servers.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <DynamicIcon
                  name="Check"
                  className="w-5 h-5 text-green-400 shrink-0 mt-0.5"
                />
                <div>
                  <h3 className="font-medium text-white">
                    Your stories are encrypted
                  </h3>
                  <p className="text-sm text-blue-200/60">
                    Your story content is encrypted using keys derived from your
                    login credentials. We literally cannot read your stories -
                    only you can decrypt them. Not even our team has access to
                    your narrative content.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <DynamicIcon
                  name="Check"
                  className="w-5 h-5 text-green-400 shrink-0 mt-0.5"
                />
                <div>
                  <h3 className="font-medium text-white">
                    We don&apos;t log your story content
                  </h3>
                  <p className="text-sm text-blue-200/60">
                    We don&apos;t keep logs of your story text or AI requests.
                    Your narrative content isn&apos;t recorded, analyzed, or
                    used for any purpose beyond generating your story.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <DynamicIcon
                  name="Check"
                  className="w-5 h-5 text-green-400 shrink-0 mt-0.5"
                />
                <div>
                  <h3 className="font-medium text-white">Private by default</h3>
                  <p className="text-sm text-blue-200/60">
                    Your stories are private unless you explicitly choose to
                    make them public or share them. No one can see your content
                    without your permission.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* AI & Third Parties */}
          <section className="bg-blue-950/30 rounded-xl border border-blue-800/30 p-6">
            <h2 className="text-xl font-semibold text-white mb-3 flex items-center gap-2">
              <DynamicIcon name="Bot" className="w-5 h-5 text-cyan-400" />
              AI Processing
            </h2>
            <div className="space-y-4">
              <p className="leading-relaxed">
                When you play a story, your choices and context are sent to AI
                providers (DeepSeek, OpenRouter) to generate continuations.
                Here&apos;s what you should know:
              </p>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 shrink-0">•</span>
                  <span className="flex-1 min-w-0">
                    AI providers process your requests to generate responses but
                    don&apos;t retain your data for training (per their
                    enterprise/API terms)
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 shrink-0">•</span>
                  <span className="flex-1 min-w-0">
                    We send only the minimum context needed for story generation
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 shrink-0">•</span>
                  <span className="flex-1 min-w-0">
                    Your full story history stays on our servers (encrypted),
                    not with AI providers
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 shrink-0">•</span>
                  <span className="flex-1 min-w-0">
                    <strong className="text-white">
                      We do not train AI on your stories
                    </strong>{" "}
                    - we couldn&apos;t even if we wanted to, since they&apos;re
                    encrypted
                  </span>
                </li>
              </ul>
            </div>
          </section>

          {/* Account Data */}
          <section className="bg-blue-950/30 rounded-xl border border-blue-800/30 p-6">
            <h2 className="text-xl font-semibold text-white mb-3 flex items-center gap-2">
              <DynamicIcon name="User" className="w-5 h-5 text-pink-400" />
              Account Information
            </h2>
            <div className="space-y-3 text-sm">
              <p>We collect and store:</p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 shrink-0">•</span>
                  <span className="flex-1 min-w-0">
                    <strong className="text-white">Email address</strong> - for
                    account authentication and important communications
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 shrink-0">•</span>
                  <span className="flex-1 min-w-0">
                    <strong className="text-white">
                      Display name &amp; profile info
                    </strong>{" "}
                    - optional, shown on your public profile
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 shrink-0">•</span>
                  <span className="flex-1 min-w-0">
                    <strong className="text-white">
                      Token balance &amp; transactions
                    </strong>{" "}
                    - to track your coin usage
                  </span>
                </li>
              </ul>
              <p className="text-blue-200/60 mt-4">
                We do not sell your personal information to third parties.
              </p>
            </div>
          </section>

          {/* Data Deletion */}
          <section className="bg-blue-950/30 rounded-xl border border-blue-800/30 p-6">
            <h2 className="text-xl font-semibold text-white mb-3 flex items-center gap-2">
              <DynamicIcon name="Trash2" className="w-5 h-5 text-red-400" />
              Deleting Your Data
            </h2>
            <div className="space-y-3">
              <p>You have full control over your data:</p>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 shrink-0">•</span>
                  <span className="flex-1 min-w-0">
                    Delete individual stories anytime from your library
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 shrink-0">•</span>
                  <span className="flex-1 min-w-0">
                    Delete adventures you&apos;ve created from the creator page
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 shrink-0">•</span>
                  <span className="flex-1 min-w-0">
                    Request complete account deletion by contacting us
                  </span>
                </li>
              </ul>
              <p className="text-sm text-blue-200/60 mt-4">
                When you delete content, it&apos;s permanently removed from our
                database. We don&apos;t keep shadow copies or backups of deleted
                content.
              </p>
            </div>
          </section>

          {/* Cookies & Analytics */}
          <section className="bg-blue-950/30 rounded-xl border border-blue-800/30 p-6">
            <h2 className="text-xl font-semibold text-white mb-3 flex items-center gap-2">
              <DynamicIcon name="Cookie" className="w-5 h-5 text-amber-400" />
              Cookies & Local Storage
            </h2>
            <div className="space-y-3 text-sm">
              <p>We use minimal browser storage for essential functionality:</p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 shrink-0">•</span>
                  <span className="flex-1 min-w-0">
                    <strong className="text-white">
                      Authentication tokens
                    </strong>{" "}
                    - to keep you logged in
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 shrink-0">•</span>
                  <span className="flex-1 min-w-0">
                    <strong className="text-white">Preferences</strong> - AI
                    model selection, TTS settings, UI preferences
                  </span>
                </li>
              </ul>
              <p className="text-blue-200/60 mt-4">
                We don&apos;t use tracking cookies or third-party analytics that
                follow you across the web.
              </p>
            </div>
          </section>

          {/* Security */}
          <section className="bg-blue-950/30 rounded-xl border border-blue-800/30 p-6">
            <h2 className="text-xl font-semibold text-white mb-3 flex items-center gap-2">
              <DynamicIcon name="Lock" className="w-5 h-5 text-green-400" />
              Security
            </h2>
            <p className="text-sm leading-relaxed">
              Your data is protected with industry-standard security measures
              including encrypted connections (HTTPS), secure authentication via
              Supabase, and row-level security policies that ensure you can only
              access your own data.
            </p>
          </section>

          {/* Contact */}
          <section className="bg-blue-950/30 rounded-xl border border-blue-800/30 p-6">
            <h2 className="text-xl font-semibold text-white mb-3 flex items-center gap-2">
              <DynamicIcon name="Mail" className="w-5 h-5 text-blue-400" />
              Questions?
            </h2>
            <p className="text-sm leading-relaxed">
              If you have any questions about this privacy policy or how we
              handle your data, please reach out to us. We&apos;re happy to
              explain anything in more detail.
            </p>
          </section>

          {/* Summary Box */}
          <section className="bg-green-500/10 rounded-xl border border-green-500/30 p-6">
            <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              <DynamicIcon name="Sparkles" className="w-5 h-5 text-green-400" />
              TL;DR
            </h2>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <DynamicIcon
                  name="Check"
                  className="w-4 h-4 text-green-400 shrink-0 mt-0.5"
                />
                <span className="flex-1 min-w-0">
                  Your stories are yours - we don&apos;t claim ownership
                </span>
              </li>
              <li className="flex items-start gap-2">
                <DynamicIcon
                  name="Check"
                  className="w-4 h-4 text-green-400 shrink-0 mt-0.5"
                />
                <span className="flex-1 min-w-0">
                  Stories are encrypted - we can&apos;t read them, only you can
                </span>
              </li>
              <li className="flex items-start gap-2">
                <DynamicIcon
                  name="Check"
                  className="w-4 h-4 text-green-400 shrink-0 mt-0.5"
                />
                <span className="flex-1 min-w-0">
                  We don&apos;t train AI on your stories (and couldn&apos;t -
                  they&apos;re encrypted)
                </span>
              </li>
              <li className="flex items-start gap-2">
                <DynamicIcon
                  name="Check"
                  className="w-4 h-4 text-green-400 shrink-0 mt-0.5"
                />
                <span className="flex-1 min-w-0">
                  Stories are stored until you delete them
                </span>
              </li>
              <li className="flex items-start gap-2">
                <DynamicIcon
                  name="Check"
                  className="w-4 h-4 text-green-400 shrink-0 mt-0.5"
                />
                <span className="flex-1 min-w-0">
                  We don&apos;t log your story content or AI requests
                </span>
              </li>
              <li className="flex items-start gap-2">
                <DynamicIcon
                  name="Check"
                  className="w-4 h-4 text-green-400 shrink-0 mt-0.5"
                />
                <span className="flex-1 min-w-0">
                  Private by default - only you can see your stories
                </span>
              </li>
              <li className="flex items-start gap-2">
                <DynamicIcon
                  name="Check"
                  className="w-4 h-4 text-green-400 shrink-0 mt-0.5"
                />
                <span className="flex-1 min-w-0">
                  Delete anytime - no shadow copies kept
                </span>
              </li>
              <li className="flex items-start gap-2">
                <DynamicIcon
                  name="Check"
                  className="w-4 h-4 text-green-400 shrink-0 mt-0.5"
                />
                <span className="flex-1 min-w-0">
                  No tracking cookies or creepy analytics
                </span>
              </li>
            </ul>
          </section>
        </div>

        {/* Back to Home */}
        <div className="mt-8 text-center">
          <button
            onClick={() => router.push("/")}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            Back to Home
          </button>
        </div>
      </main>
    </div>
  );
}
