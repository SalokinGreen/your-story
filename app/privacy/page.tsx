"use client";

import { useRouter } from "next/navigation";
import { DynamicIcon } from "../components/DynamicIcon";

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
    <section className="bg-blue-950/30 rounded-xl border border-blue-800/30 p-6">
      <h2 className="text-xl font-semibold text-white mb-3 flex items-center gap-2">
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
        className="w-5 h-5 text-green-400 shrink-0 mt-0.5"
      />
      <div>
        <h3 className="font-medium text-white">{title}</h3>
        <p className="text-sm text-blue-200/60">{children}</p>
      </div>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="text-blue-400 shrink-0">•</span>
      <span className="flex-1 min-w-0">{children}</span>
    </li>
  );
}

function Summary({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <DynamicIcon
        name="Check"
        className="w-4 h-4 text-green-400 shrink-0 mt-0.5"
      />
      <span className="flex-1 min-w-0">{children}</span>
    </li>
  );
}

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
            Last updated: October 20, 2026
          </p>
        </div>

        {/* Content */}
        <div className="space-y-8 text-blue-200/80">
          <Section
            icon="Shield"
            iconClassName="text-blue-400"
            title="Your Privacy Matters"
          >
            <p className="leading-relaxed">
              Your Story has no accounts and no database of its own. Your
              stories live on your device, and the app talks to AI services
              with API keys you bring yourself. This page lists every place
              your data can go, in plain terms.
            </p>
          </Section>

          <Section
            icon="BookOpen"
            iconClassName="text-purple-400"
            title="Your Stories Stay on Your Device"
          >
            <div className="space-y-4">
              <Point title="You own your stories">
                Everything you create - stories, adventures, notes - is yours.
                We don&apos;t claim any ownership over it.
              </Point>
              <Point title="Saved on your device, not on our servers">
                Stories, adventures, notes, folders and settings are saved in
                the app&apos;s local storage on your device. We don&apos;t
                have a copy and can&apos;t see them.
              </Point>
              <Point title="No account">
                We never ask for your email address, your name or a password.
              </Point>
              <Point title="Deleting is up to you">
                Deleting a story removes it from your device. Uninstalling the
                app, or clearing this site&apos;s data in your browser,
                removes everything. If you use sync, your next sync removes
                deleted items from the synced copy too.
              </Point>
            </div>
          </Section>

          <Section icon="Bot" iconClassName="text-cyan-400" title="AI Processing">
            <div className="space-y-4">
              <p className="leading-relaxed">
                To write each turn, the app sends the AI provider you chose
                what it needs to continue the story: your action, the recent
                story, and the relevant notes, such as your character sheet
                and the adventure&apos;s rules. It uses your own API key, so
                the request is between you and that provider.
              </p>
              <ul className="space-y-2 text-sm">
                <Bullet>
                  <strong className="text-white">Story generation</strong> -
                  DeepSeek, OpenRouter, Google, Mistral or DeepInfra, whichever
                  serves the model you picked. OpenRouter passes requests on to
                  the company hosting that model.
                </Bullet>
                <Bullet>
                  <strong className="text-white">Optional features</strong>,
                  only when you use them - voice narration goes to Cartesia or
                  ElevenLabs, voice input and PDF import go to Mistral, and
                  image generation goes to OpenRouter or DeepInfra.
                </Bullet>
                <Bullet>
                  Each provider handles your data under its own privacy policy
                  and your agreement with it. Whether it keeps your requests or
                  trains on them depends on that provider and your account
                  settings there, so check their terms.
                </Bullet>
                <Bullet>
                  <strong className="text-white">
                    We do not train AI on your stories.
                  </strong>
                </Bullet>
              </ul>
              <p className="text-sm text-blue-200/60">
                In the desktop and mobile apps, these requests go straight from
                your device to the provider. In the browser version they pass
                through a small relay on our web server, because a browser
                can&apos;t call every provider directly. The relay forwards
                the request, including your API key, and hands back the
                answer. It doesn&apos;t save your story or your key, though
                like any website its host may keep standard access logs, such
                as your IP address and the time of the request.
              </p>
            </div>
          </Section>

          <Section icon="Key" iconClassName="text-amber-400" title="Your API Keys">
            <ul className="space-y-2 text-sm">
              <Bullet>
                Your keys are saved only on your device, in the app&apos;s
                local storage. They aren&apos;t encrypted there, so anyone who
                can use your device or browser profile can read them.
              </Bullet>
              <Bullet>
                Each key is sent only to the provider it belongs to (through
                the relay, in the browser version).
              </Bullet>
              <Bullet>
                Keys are never synced and never sent to other players.
              </Bullet>
            </ul>
          </Section>

          <Section
            icon="RefreshCw"
            iconClassName="text-green-400"
            title="Sync Between Devices (Optional)"
          >
            <div className="space-y-4">
              <Point title="Off until you set it up">
                Nothing leaves your device for sync unless you link a sync key
                and press Sync Now in Settings.
              </Point>
              <Point title="Encrypted before it leaves your device">
                Your stories, adventures, notes, folders and settings are
                encrypted on your device with a key made from your sync key.
                Our sync server stores only that encrypted data and a
                fingerprint (hash) of your sync key.
              </Point>
              <Point title="Treat your sync key like a password">
                Your device sends the sync key with each sync to prove the
                data is yours. Anyone who has it can download and decrypt your
                synced data, and if you lose it, the synced copy can&apos;t be
                recovered.
              </Point>
              <Point title="Rate limiting">
                The sync server keeps your IP address for a couple of minutes
                to limit how many requests one device can make.
              </Point>
            </div>
          </Section>

          <Section
            icon="Users"
            iconClassName="text-pink-400"
            title="Playing Online"
          >
            <ul className="space-y-2 text-sm">
              <Bullet>
                Online play connects players&apos; devices directly to each
                other. To find each other, devices use a public matchmaking
                service - BitTorrent trackers, Nostr relays, MQTT brokers or
                the PeerJS server, depending on the connection you choose.
                These services see your IP address, not your story.
              </Bullet>
              <Bullet>
                Players in the same room can see each other&apos;s IP
                addresses. That&apos;s how direct connections work.
              </Bullet>
              <Bullet>
                <strong className="text-white">
                  The host&apos;s device sends the whole story to everyone in
                  the room
                </strong>
                , including notes the GM keeps hidden from players. Only play
                online with people you&apos;d trust with those notes.
              </Bullet>
            </ul>
          </Section>

          <Section
            icon="EyeOff"
            iconClassName="text-amber-400"
            title="No Tracking"
          >
            <div className="space-y-3 text-sm">
              <p>
                The app contains no analytics, advertising, crash-reporting or
                tracking code, and sets no tracking cookies. Fonts, icons and
                dice are bundled with the app, so just opening it doesn&apos;t
                contact anyone.
              </p>
              <p className="text-blue-200/60">
                Links to other sites, such as Ko-fi, open those sites under
                their own policies.
              </p>
            </div>
          </Section>

          <Section icon="Lock" iconClassName="text-green-400" title="Security">
            <p className="text-sm leading-relaxed">
              Connections to AI providers, the relay and the sync server use
              HTTPS, and online play uses the encryption built into WebRTC.
              Since your device is where your data lives, its own security
              matters most: a screen lock, disk encryption, and being careful
              who else uses your browser.
            </p>
          </Section>

          <Section
            icon="MessageCircle"
            iconClassName="text-blue-400"
            title="Questions?"
          >
            <p className="text-sm leading-relaxed">
              If you have questions about this policy or how your data is
              handled, open an issue on{" "}
              <a
                href={ISSUES_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-300 underline hover:text-blue-200"
              >
                our GitHub
              </a>
              . Issues are public, so don&apos;t include your API keys or
              anything from your stories you&apos;d rather keep private.
            </p>
          </Section>

          {/* Summary Box */}
          <section className="bg-green-500/10 rounded-xl border border-green-500/30 p-6">
            <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              <DynamicIcon name="Sparkles" className="w-5 h-5 text-green-400" />
              TL;DR
            </h2>
            <ul className="space-y-2 text-sm">
              <Summary>
                Your stories are yours, and they stay on your device
              </Summary>
              <Summary>No account - we don&apos;t collect your email or name</Summary>
              <Summary>
                AI requests go to the provider you choose, with your own key
              </Summary>
              <Summary>We don&apos;t train AI on your stories</Summary>
              <Summary>
                Sync is optional and encrypted on your device first
              </Summary>
              <Summary>
                Online play shares the whole story, hidden notes included,
                with everyone in the room
              </Summary>
              <Summary>No analytics, no tracking cookies</Summary>
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
