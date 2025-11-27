"use client";

import { useRouter } from "next/navigation";
import { DynamicIcon } from "../components/DynamicIcon";

export default function TermsOfService() {
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
          <h1 className="text-3xl font-bold text-white mb-2">
            Terms of Service
          </h1>
          <p className="text-blue-200/40 text-sm">
            Last updated: November 27, 2025
          </p>
        </div>

        {/* Content */}
        <div className="space-y-8 text-blue-200/80">
          {/* Introduction */}
          <section className="bg-blue-950/30 rounded-xl border border-blue-800/30 p-6">
            <h2 className="text-xl font-semibold text-white mb-3 flex items-center gap-2">
              <DynamicIcon name="FileText" className="w-5 h-5 text-blue-400" />
              Welcome to Your Story
            </h2>
            <p className="leading-relaxed">
              By using Your Story, you agree to these terms. We&apos;re still in
              alpha and these terms will evolve as we grow, but the core
              principles will remain: be respectful, create responsibly, and
              have fun.
            </p>
            <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <p className="text-sm text-amber-200 flex items-start gap-2">
                <DynamicIcon
                  name="AlertTriangle"
                  className="w-4 h-4 shrink-0 mt-0.5"
                />
                <span>
                  <strong>Alpha Notice:</strong> These terms are a work in
                  progress. We&apos;ll notify users of significant changes as we
                  finalize them.
                </span>
              </p>
            </div>
          </section>

          {/* Age Requirement */}
          <section className="bg-red-500/10 rounded-xl border border-red-500/30 p-6">
            <h2 className="text-xl font-semibold text-white mb-3 flex items-center gap-2">
              <DynamicIcon name="UserX" className="w-5 h-5 text-red-400" />
              Age Requirement
            </h2>
            <div className="space-y-3">
              <p className="text-lg font-medium text-white">
                You must be at least 18 years old to use Your Story.
              </p>
              <p className="text-sm text-blue-200/60">
                This platform involves AI-generated content that may include
                mature themes, violence, and other content not suitable for
                minors. By creating an account, you confirm that you are 18
                years of age or older.
              </p>
              <p className="text-sm text-red-300">
                If we discover that a user is under 18, their account will be
                terminated immediately.
              </p>
            </div>
          </section>

          {/* Acceptable Use */}
          <section className="bg-blue-950/30 rounded-xl border border-blue-800/30 p-6">
            <h2 className="text-xl font-semibold text-white mb-3 flex items-center gap-2">
              <DynamicIcon name="ThumbsUp" className="w-5 h-5 text-green-400" />
              Acceptable Use
            </h2>
            <div className="space-y-4">
              <p>When using Your Story, you agree to:</p>
              <div className="grid gap-3">
                <div className="flex items-start gap-3">
                  <DynamicIcon
                    name="Check"
                    className="w-5 h-5 text-green-400 shrink-0 mt-0.5"
                  />
                  <div>
                    <h3 className="font-medium text-white">
                      Create responsibly
                    </h3>
                    <p className="text-sm text-blue-200/60">
                      Use the platform for creative storytelling and
                      entertainment
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <DynamicIcon
                    name="Check"
                    className="w-5 h-5 text-green-400 shrink-0 mt-0.5"
                  />
                  <div>
                    <h3 className="font-medium text-white">Respect others</h3>
                    <p className="text-sm text-blue-200/60">
                      Don&apos;t harass, threaten, or target real people in
                      public content
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <DynamicIcon
                    name="Check"
                    className="w-5 h-5 text-green-400 shrink-0 mt-0.5"
                  />
                  <div>
                    <h3 className="font-medium text-white">Keep it legal</h3>
                    <p className="text-sm text-blue-200/60">
                      Don&apos;t use the platform for illegal purposes or to
                      generate illegal content
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Prohibited Content */}
          <section className="bg-blue-950/30 rounded-xl border border-blue-800/30 p-6">
            <h2 className="text-xl font-semibold text-white mb-3 flex items-center gap-2">
              <DynamicIcon name="Ban" className="w-5 h-5 text-red-400" />
              Prohibited Content
            </h2>
            <div className="space-y-3">
              <p className="text-sm">
                The following content is strictly prohibited:
              </p>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <DynamicIcon
                    name="X"
                    className="w-4 h-4 text-red-400 shrink-0 mt-0.5"
                  />
                  <span className="flex-1 min-w-0">
                    Content sexualizing minors in any way (zero tolerance)
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <DynamicIcon
                    name="X"
                    className="w-4 h-4 text-red-400 shrink-0 mt-0.5"
                  />
                  <span className="flex-1 min-w-0">
                    Real person harassment or defamation
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <DynamicIcon
                    name="X"
                    className="w-4 h-4 text-red-400 shrink-0 mt-0.5"
                  />
                  <span className="flex-1 min-w-0">
                    Content promoting violence against real individuals or
                    groups
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <DynamicIcon
                    name="X"
                    className="w-4 h-4 text-red-400 shrink-0 mt-0.5"
                  />
                  <span className="flex-1 min-w-0">
                    Instructions for illegal activities or creating weapons
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <DynamicIcon
                    name="X"
                    className="w-4 h-4 text-red-400 shrink-0 mt-0.5"
                  />
                  <span className="flex-1 min-w-0">
                    Spam, scams, or malicious content
                  </span>
                </li>
              </ul>
              <p className="text-sm text-blue-200/60 mt-4">
                Private stories are your business, but public adventures and
                shared content must follow these rules.
              </p>
            </div>
          </section>

          {/* Moderation */}
          <section className="bg-blue-950/30 rounded-xl border border-blue-800/30 p-6">
            <h2 className="text-xl font-semibold text-white mb-3 flex items-center gap-2">
              <DynamicIcon name="Shield" className="w-5 h-5 text-purple-400" />
              Moderation
            </h2>
            <div className="space-y-4">
              <p>
                We have moderators who review public content and respond to
                reports. Here&apos;s how moderation works:
              </p>
              <div className="grid gap-3 text-sm">
                <div className="flex items-start gap-3 p-3 bg-blue-950/50 rounded-lg">
                  <DynamicIcon
                    name="Eye"
                    className="w-5 h-5 text-blue-400 shrink-0"
                  />
                  <div>
                    <h3 className="font-medium text-white">
                      Public content review
                    </h3>
                    <p className="text-blue-200/60">
                      Public adventures may be reviewed to ensure they follow
                      our guidelines
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-blue-950/50 rounded-lg">
                  <DynamicIcon
                    name="Flag"
                    className="w-5 h-5 text-amber-400 shrink-0"
                  />
                  <div>
                    <h3 className="font-medium text-white">Report system</h3>
                    <p className="text-blue-200/60">
                      Users can report content that violates our terms (coming
                      soon)
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-blue-950/50 rounded-lg">
                  <DynamicIcon
                    name="Lock"
                    className="w-5 h-5 text-green-400 shrink-0"
                  />
                  <div>
                    <h3 className="font-medium text-white">
                      Private stories stay private
                    </h3>
                    <p className="text-blue-200/60">
                      We don&apos;t proactively monitor private stories unless
                      reported
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Account Actions */}
          <section className="bg-blue-950/30 rounded-xl border border-blue-800/30 p-6">
            <h2 className="text-xl font-semibold text-white mb-3 flex items-center gap-2">
              <DynamicIcon name="Gavel" className="w-5 h-5 text-amber-400" />
              Account Actions & Bans
            </h2>
            <div className="space-y-4">
              <p>
                Violating these terms may result in action against your account:
              </p>
              <div className="space-y-3 text-sm">
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-300 text-xs font-bold shrink-0">
                    1
                  </span>
                  <div>
                    <h3 className="font-medium text-white">Warning</h3>
                    <p className="text-blue-200/60">
                      First-time minor violations typically result in a warning
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-300 text-xs font-bold shrink-0">
                    2
                  </span>
                  <div>
                    <h3 className="font-medium text-white">Content removal</h3>
                    <p className="text-blue-200/60">
                      Violating content may be removed or made private
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center text-red-300 text-xs font-bold shrink-0">
                    3
                  </span>
                  <div>
                    <h3 className="font-medium text-white">
                      Temporary suspension
                    </h3>
                    <p className="text-blue-200/60">
                      Repeated violations may result in temporary account
                      suspension
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-red-500/30 flex items-center justify-center text-red-400 text-xs font-bold shrink-0">
                    4
                  </span>
                  <div>
                    <h3 className="font-medium text-white">Permanent ban</h3>
                    <p className="text-blue-200/60">
                      Severe violations or repeated offenses result in permanent
                      ban
                    </p>
                  </div>
                </div>
              </div>
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg mt-4">
                <p className="text-sm text-red-200 flex items-start gap-2">
                  <DynamicIcon
                    name="AlertTriangle"
                    className="w-4 h-4 shrink-0 mt-0.5"
                  />
                  <span>
                    <strong>Instant ban offenses:</strong> Content sexualizing
                    minors, underage users, or severe illegal content will
                    result in immediate permanent ban without warning.
                  </span>
                </p>
              </div>
            </div>
          </section>

          {/* Your Content */}
          <section className="bg-blue-950/30 rounded-xl border border-blue-800/30 p-6">
            <h2 className="text-xl font-semibold text-white mb-3 flex items-center gap-2">
              <DynamicIcon name="PenTool" className="w-5 h-5 text-pink-400" />
              Your Content
            </h2>
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <DynamicIcon
                  name="Check"
                  className="w-5 h-5 text-green-400 shrink-0 mt-0.5"
                />
                <p>You retain ownership of stories and adventures you create</p>
              </div>
              <div className="flex items-start gap-3">
                <DynamicIcon
                  name="Check"
                  className="w-5 h-5 text-green-400 shrink-0 mt-0.5"
                />
                <p>
                  Your stories are encrypted with keys derived from your login -
                  we can&apos;t read them
                </p>
              </div>
              <div className="flex items-start gap-3">
                <DynamicIcon
                  name="Check"
                  className="w-5 h-5 text-green-400 shrink-0 mt-0.5"
                />
                <p>
                  By making content public, you grant us permission to display
                  it on the platform
                </p>
              </div>
              <div className="flex items-start gap-3">
                <DynamicIcon
                  name="Check"
                  className="w-5 h-5 text-green-400 shrink-0 mt-0.5"
                />
                <p>You can delete your content at any time</p>
              </div>
              <div className="flex items-start gap-3">
                <DynamicIcon
                  name="Check"
                  className="w-5 h-5 text-green-400 shrink-0 mt-0.5"
                />
                <p>
                  We don&apos;t train AI on your stories - and couldn&apos;t
                  even if we wanted to (they&apos;re encrypted)
                </p>
              </div>
            </div>
          </section>

          {/* Tokens & Purchases */}
          <section className="bg-blue-950/30 rounded-xl border border-blue-800/30 p-6">
            <h2 className="text-xl font-semibold text-white mb-3 flex items-center gap-2">
              <DynamicIcon name="Coins" className="w-5 h-5 text-yellow-400" />
              Tokens & Purchases
            </h2>
            <div className="space-y-3 text-sm">
              <p>Regarding in-app purchases and tokens:</p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 shrink-0">•</span>
                  <span className="flex-1 min-w-0">
                    Token purchases are final and non-refundable
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 shrink-0">•</span>
                  <span className="flex-1 min-w-0">
                    Tokens have no real-world cash value and cannot be exchanged
                    for money
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 shrink-0">•</span>
                  <span className="flex-1 min-w-0">
                    We reserve the right to modify token pricing and packages
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 shrink-0">•</span>
                  <span className="flex-1 min-w-0">
                    Banned accounts forfeit any remaining tokens
                  </span>
                </li>
              </ul>
            </div>
          </section>

          {/* Service Availability */}
          <section className="bg-blue-950/30 rounded-xl border border-blue-800/30 p-6">
            <h2 className="text-xl font-semibold text-white mb-3 flex items-center gap-2">
              <DynamicIcon name="Server" className="w-5 h-5 text-cyan-400" />
              Service Availability
            </h2>
            <div className="space-y-3 text-sm">
              <p>
                We strive to keep Your Story running smoothly, but as an alpha
                service:
              </p>
              <ul className="space-y-2 text-blue-200/60">
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 shrink-0">•</span>
                  <span className="flex-1 min-w-0">
                    The service is provided &quot;as is&quot; without guarantees
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 shrink-0">•</span>
                  <span className="flex-1 min-w-0">
                    We may have downtime for maintenance or updates
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 shrink-0">•</span>
                  <span className="flex-1 min-w-0">
                    Features may change or be removed as we develop the platform
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 shrink-0">•</span>
                  <span className="flex-1 min-w-0">
                    We&apos;re not liable for any losses related to service
                    interruptions
                  </span>
                </li>
              </ul>
            </div>
          </section>

          {/* Contact */}
          <section className="bg-blue-950/30 rounded-xl border border-blue-800/30 p-6">
            <h2 className="text-xl font-semibold text-white mb-3 flex items-center gap-2">
              <DynamicIcon name="Mail" className="w-5 h-5 text-blue-400" />
              Questions or Appeals?
            </h2>
            <p className="text-sm leading-relaxed">
              If you have questions about these terms, believe you were wrongly
              actioned, or need to report a violation, please reach out to us.
              We aim to be fair and will review appeals in good faith.
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
                  You must be 18 or older to use this platform
                </span>
              </li>
              <li className="flex items-start gap-2">
                <DynamicIcon
                  name="Check"
                  className="w-4 h-4 text-green-400 shrink-0 mt-0.5"
                />
                <span className="flex-1 min-w-0">
                  Don&apos;t create content sexualizing minors (instant ban)
                </span>
              </li>
              <li className="flex items-start gap-2">
                <DynamicIcon
                  name="Check"
                  className="w-4 h-4 text-green-400 shrink-0 mt-0.5"
                />
                <span className="flex-1 min-w-0">
                  Be respectful - don&apos;t harass real people
                </span>
              </li>
              <li className="flex items-start gap-2">
                <DynamicIcon
                  name="Check"
                  className="w-4 h-4 text-green-400 shrink-0 mt-0.5"
                />
                <span className="flex-1 min-w-0">
                  Moderators review public content and reports
                </span>
              </li>
              <li className="flex items-start gap-2">
                <DynamicIcon
                  name="Check"
                  className="w-4 h-4 text-green-400 shrink-0 mt-0.5"
                />
                <span className="flex-1 min-w-0">
                  Violations may lead to warnings, suspension, or ban
                </span>
              </li>
              <li className="flex items-start gap-2">
                <DynamicIcon
                  name="Check"
                  className="w-4 h-4 text-green-400 shrink-0 mt-0.5"
                />
                <span className="flex-1 min-w-0">
                  Your content is yours - we don&apos;t claim ownership
                </span>
              </li>
              <li className="flex items-start gap-2">
                <DynamicIcon
                  name="Check"
                  className="w-4 h-4 text-green-400 shrink-0 mt-0.5"
                />
                <span className="flex-1 min-w-0">
                  Stories are encrypted - we can&apos;t read them, no AI
                  training
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
