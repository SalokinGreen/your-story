"use client";

import { useRouter } from "next/navigation";
import { DynamicIcon } from "../components/DynamicIcon";
import { useRouteBack } from "../misc/useBackHandler";

const ISSUES_URL = "https://github.com/SalokinGreen/your-story/issues";

function Section({
  icon,
  iconClassName,
  title,
  children,
}: {
  icon: string;
  iconClassName: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-ys-surface rounded-xl border border-ys-border p-6">
      <h2 className="text-xl font-semibold text-ys-text mb-3 flex items-center gap-2">
        <DynamicIcon name={icon} className={`w-5 h-5 ${iconClassName}`} />
        {title}
      </h2>
      {children}
    </section>
  );
}

function Point({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <DynamicIcon
        name="Check"
        className="w-5 h-5 text-ys-success shrink-0 mt-0.5"
      />
      <div>
        <h3 className="font-medium text-ys-text">{title}</h3>
        <p className="text-sm text-ys-muted">{children}</p>
      </div>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="text-ys-accent shrink-0">•</span>
      <span className="flex-1 min-w-0">{children}</span>
    </li>
  );
}

function Forbidden({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <DynamicIcon name="X" className="w-4 h-4 text-ys-danger shrink-0 mt-0.5" />
      <span className="flex-1 min-w-0">{children}</span>
    </li>
  );
}

function Summary({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <DynamicIcon
        name="Check"
        className="w-4 h-4 text-ys-success shrink-0 mt-0.5"
      />
      <span className="flex-1 min-w-0">{children}</span>
    </li>
  );
}

export default function TermsOfService() {
  const router = useRouter();
  useRouteBack(() => router.back());

  return (
    <div className="min-h-screen bg-[image:var(--ys-gradient)]">
      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-ys-muted hover:text-ys-text transition-colors mb-4"
          >
            <DynamicIcon name="ArrowLeft" className="w-4 h-4" />
            Back
          </button>
          <h1 className="text-3xl font-bold text-ys-text mb-2">
            Terms of Service
          </h1>
          <p className="text-ys-muted text-sm">
            Last updated: October 21, 2026
          </p>
        </div>

        {/* Content */}
        <div className="space-y-8 text-ys-text">
          <Section
            icon="FileText"
            iconClassName="text-ys-accent"
            title="Welcome to Your Story"
          >
            <p className="leading-relaxed">
              By using Your Story, you agree to these terms. Your Story runs on
              your device: there are no accounts, your stories are saved
              locally, and the AI is run by providers you choose, with API keys
              you bring yourself. The core principles are simple: be
              respectful, create responsibly, and have fun.
            </p>
            <div className="mt-4 p-3 bg-ys-warning/10 border border-ys-warning/30 rounded-lg">
              <p className="text-sm text-ys-warning flex items-start gap-2">
                <DynamicIcon
                  name="TriangleAlert"
                  className="w-4 h-4 shrink-0 mt-0.5"
                />
                <span>
                  <strong>Alpha Notice:</strong> Your Story is still in alpha,
                  and these terms will change as the app does. When they
                  change, the date at the top of this page changes too.
                </span>
              </p>
            </div>
          </Section>

          {/* Age Requirement */}
          <section className="bg-ys-danger/10 rounded-xl border border-ys-danger/30 p-6">
            <h2 className="text-xl font-semibold text-ys-text mb-3 flex items-center gap-2">
              <DynamicIcon name="UserX" className="w-5 h-5 text-ys-danger" />
              Age Requirement
            </h2>
            <div className="space-y-3">
              <p className="text-lg font-medium text-ys-text">
                You must be at least 18 years old to use Your Story.
              </p>
              <p className="text-sm text-ys-muted">
                The AI can generate mature themes, violence, and other content
                not suitable for minors. By using the app, you confirm that you
                are 18 years of age or older.
              </p>
            </div>
          </section>

          <Section
            icon="ThumbsUp"
            iconClassName="text-ys-success"
            title="Acceptable Use"
          >
            <div className="space-y-4">
              <p>When using Your Story, you agree to:</p>
              <div className="grid gap-3">
                <Point title="Create responsibly">
                  Use the app for creative storytelling and entertainment
                </Point>
                <Point title="Respect others">
                  Don&apos;t harass or threaten the people you play with
                  online, and don&apos;t target real people in anything you
                  share
                </Point>
                <Point title="Keep it legal">
                  Don&apos;t use the app for illegal purposes or to generate
                  illegal content
                </Point>
              </div>
            </div>
          </Section>

          <Section
            icon="Ban"
            iconClassName="text-ys-danger"
            title="Prohibited Content"
          >
            <div className="space-y-3">
              <p className="text-sm">
                The following content is strictly prohibited:
              </p>
              <ul className="space-y-2 text-sm">
                <Forbidden>
                  Content sexualizing minors in any way (zero tolerance)
                </Forbidden>
                <Forbidden>Real person harassment or defamation</Forbidden>
                <Forbidden>
                  Content promoting violence against real individuals or groups
                </Forbidden>
                <Forbidden>
                  Instructions for illegal activities or creating weapons
                </Forbidden>
                <Forbidden>Spam, scams, or malicious content</Forbidden>
              </ul>
              <p className="text-sm text-ys-muted mt-4">
                These rules apply to everything you share: what you send to
                other players in online play, and stories, adventures or notes
                you pass on as exported files. Content sexualizing minors is
                not allowed anywhere, private stories included. Beyond that,
                what you play on your own is your business, within the law and
                your AI provider&apos;s usage policy, which applies to every
                request you send with your key.
              </p>
            </div>
          </Section>

          <Section
            icon="Scale"
            iconClassName="text-ys-accent"
            title="Your Responsibility"
          >
            <div className="space-y-4">
              <Point title="We can't see what you make">
                Your stories are saved on your device, so nobody reviews them.
                There are no moderators, no reporting system, and no accounts
                to warn, suspend or ban.
              </Point>
              <Point title="What you generate and share is up to you">
                You&apos;re responsible for what you ask the AI to write, and
                for what you do with it and who you share it with.
              </Point>
              <Point title="Your AI provider has its own rules">
                Providers can enforce their usage policies on requests made
                with your key, up to suspending your account with them.
                That&apos;s between you and the provider.
              </Point>
              <Point title="Choose who you play with">
                Online play connects players&apos; devices directly, and
                nobody moderates the rooms. The host&apos;s device sends the
                whole story, including notes the GM keeps hidden, to everyone
                in the room, so only play online with people you trust.
              </Point>
            </div>
          </Section>

          <Section
            icon="PenTool"
            iconClassName="text-ys-accent"
            title="Your Content"
          >
            <ul className="space-y-2 text-sm">
              <Bullet>
                You own the stories, adventures and notes you create. We
                don&apos;t claim any ownership over them.
              </Bullet>
              <Bullet>
                Your content is saved on your device. We don&apos;t have a copy
                and can&apos;t read it. If you use sync, it&apos;s encrypted on
                your device before it&apos;s uploaded.
              </Bullet>
              <Bullet>You can delete your content at any time.</Bullet>
              <Bullet>
                We don&apos;t train AI on your stories, and we don&apos;t keep
                them anywhere we could read them.
              </Bullet>
              <Bullet>
                Only import PDFs, rulebooks and other material you have the
                right to use.
              </Bullet>
            </ul>
          </Section>

          <Section
            icon="KeyRound"
            iconClassName="text-ys-warning"
            title="AI Provider Keys"
          >
            <div className="space-y-3 text-sm">
              <p>
                Your Story has no in-app purchases and no credit balance. All AI
                generation runs on API keys you supply yourself:
              </p>
              <ul className="space-y-2">
                <Bullet>
                  You bring your own keys (OpenRouter, DeepSeek, Google,
                  Mistral, DeepInfra, and the voice providers Cartesia and
                  ElevenLabs) and are billed directly by those providers
                </Bullet>
                <Bullet>
                  Your keys are saved only on your device and are sent only to
                  the provider they belong to (through our relay, in the
                  browser version)
                </Bullet>
                <Bullet>
                  Your use of each provider is governed by your agreement with
                  it, including its pricing and usage policies
                </Bullet>
                <Bullet>
                  We don&apos;t control provider pricing, rate limits, or
                  availability, and can&apos;t refund what a provider charges
                  you
                </Bullet>
                <Bullet>
                  Cost figures shown in the app are estimates from published
                  provider prices, not a bill
                </Bullet>
              </ul>
            </div>
          </Section>

          <Section
            icon="Server"
            iconClassName="text-ys-accent"
            title="Service Availability"
          >
            <div className="space-y-3 text-sm">
              <p>
                Your Story runs on your device, so most of it doesn&apos;t
                depend on us. Still, as an alpha app:
              </p>
              <ul className="space-y-2 text-ys-muted">
                <Bullet>
                  The app is provided &quot;as is&quot; without guarantees
                </Bullet>
                <Bullet>
                  The parts we run - the relay the browser version uses for AI
                  requests, and the optional sync server - may have downtime
                  for maintenance or updates
                </Bullet>
                <Bullet>
                  AI providers and the matchmaking services used for online
                  play are run by others, and we don&apos;t control their
                  availability
                </Bullet>
                <Bullet>
                  Features may change or be removed as we develop the app
                </Bullet>
                <Bullet>
                  Your stories live on your device. Clearing this site&apos;s
                  data in your browser or uninstalling the app deletes them, so
                  keep backups by exporting folders from the Library or by
                  using sync
                </Bullet>
                <Bullet>
                  We&apos;re not liable for any losses related to service
                  interruptions or lost data
                </Bullet>
              </ul>
            </div>
          </Section>

          <Section
            icon="MessageCircle"
            iconClassName="text-ys-accent"
            title="Questions?"
          >
            <p className="text-sm leading-relaxed">
              If you have questions about these terms, open an issue on{" "}
              <a
                href={ISSUES_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-ys-muted underline hover:text-ys-text"
              >
                our GitHub
              </a>
              . Issues are public, so don&apos;t include your API keys or
              anything from your stories you&apos;d rather keep private.
            </p>
          </Section>

          {/* Summary Box */}
          <section className="bg-ys-success/10 rounded-xl border border-ys-success/30 p-6">
            <h2 className="text-lg font-semibold text-ys-text mb-3 flex items-center gap-2">
              <DynamicIcon name="Sparkles" className="w-5 h-5 text-ys-success" />
              TL;DR
            </h2>
            <ul className="space-y-2 text-sm">
              <Summary>You must be 18 or older to use Your Story</Summary>
              <Summary>
                Never create content sexualizing minors, not even privately
              </Summary>
              <Summary>
                Be respectful - don&apos;t harass other players or target real
                people
              </Summary>
              <Summary>
                We can&apos;t see your stories: no accounts, no moderators, no
                bans
              </Summary>
              <Summary>
                You&apos;re responsible for what you generate and share, and
                your AI provider&apos;s rules apply
              </Summary>
              <Summary>
                Your content is yours and stays on your device - no AI training
              </Summary>
              <Summary>
                No in-app purchases - you pay AI providers directly with your
                own keys
              </Summary>
            </ul>
          </section>
        </div>

        {/* Back to Home */}
        <div className="mt-8 text-center">
          <button
            onClick={() => router.push("/")}
            className="px-6 py-2 bg-ys-accent text-ys-on-accent font-medium rounded-lg transition-colors hover:opacity-90"
          >
            Back to Home
          </button>
        </div>
      </main>
    </div>
  );
}
