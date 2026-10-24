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

export default function PrivacyPolicy() {
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
          <h1 className="text-3xl font-bold text-ys-text mb-2">Privacy Policy</h1>
          <p className="text-ys-muted text-sm">
            Last updated: October 24, 2026
          </p>
        </div>

        {/* Content */}
        <div className="space-y-8 text-ys-text">
          <Section
            icon="Shield"
            iconClassName="text-ys-accent"
            title="Your Privacy Matters"
          >
            <p className="leading-relaxed">
              Endless Adventure has no accounts and no database of your
              stories. They live on your device, and the app talks to AI
              services with API keys you bring yourself. The one thing
              the developer can read is feedback you choose to send (see
              &ldquo;Feedback You Send&rdquo; below). This page lists every
              place your data can go, in plain terms.
            </p>
          </Section>

          <Section
            icon="BookOpen"
            iconClassName="text-ys-accent"
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

          <Section icon="Bot" iconClassName="text-ys-accent" title="AI Processing">
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
                  <strong className="text-ys-text">Story generation</strong> -
                  DeepSeek, OpenRouter, Google, Mistral or DeepInfra, whichever
                  serves the model you picked. OpenRouter passes requests on to
                  the company hosting that model.
                </Bullet>
                <Bullet>
                  <strong className="text-ys-text">Optional features</strong>,
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
                  <strong className="text-ys-text">
                    We do not train AI on your stories.
                  </strong>
                </Bullet>
              </ul>
              <p className="text-sm text-ys-muted">
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

          <Section icon="Key" iconClassName="text-ys-warning" title="Your API Keys">
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
            iconClassName="text-ys-success"
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
            icon="MessageSquare"
            iconClassName="text-ys-accent"
            title="Feedback You Send"
          >
            <div className="space-y-4">
              <Point title="Optional, and only when you press Send">
                The app has places to leave feedback: on a turn, on a built-in
                system or starter, after a night, and from the menu and
                Settings. Nothing is sent until you press Send, and you can
                turn off the after-a-night prompt in Settings.
              </Point>
              <Point title="What is sent">
                Your optional star rating and the text you write, which kind of
                feedback it is, the built-in system or starter it is about (if
                any), the app version and platform, and a random id made for
                this feedback. If you tick &ldquo;Attach this turn&rdquo; it
                also sends that turn: your line, the turn&apos;s story text as
                you see it (with anything marked hidden left out), a short
                summary of its dice rolls, and the model name. You see and can
                edit the attached text before sending. Nothing else is
                attached: no other turns, notes, character sheets, memory,
                settings or keys, and no device id.
              </Point>
              <Point title="Who can read it, and for how long">
                The developer can read it. It is stored in the developer&apos;s
                Cloudflare database for 180 days and then deleted. Feedback is
                separate from sync, and is not encrypted the way synced data
                is.
              </Point>
              <Point title="Your IP address">
                Your IP address reaches Cloudflare with the request. It is used
                only to limit abuse (how many sends one device can make in a
                minute) and is not stored with your feedback.
              </Point>
              <Point title="Asking for it to be deleted">
                After a send, the app shows a reference for it. To have that
                feedback deleted, open an issue on{" "}
                <a
                  href={ISSUES_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-ys-text"
                >
                  our GitHub
                </a>{" "}
                quoting the reference. Issues are public, so don&apos;t put
                anything else private in one.
              </Point>
            </div>
          </Section>

          <Section
            icon="Users"
            iconClassName="text-ys-accent"
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
                <strong className="text-ys-text">
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
            iconClassName="text-ys-warning"
            title="No Tracking"
          >
            <div className="space-y-3 text-sm">
              <p>
                The app contains no analytics, advertising, crash-reporting or
                tracking code, and sets no tracking cookies. Fonts, icons and
                dice are bundled with the app, so just opening it doesn&apos;t
                contact anyone.
              </p>
              <p className="text-ys-muted">
                Links to other sites, such as Ko-fi, open those sites under
                their own policies.
              </p>
            </div>
          </Section>

          <Section icon="Lock" iconClassName="text-ys-success" title="Security">
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
            iconClassName="text-ys-accent"
            title="Questions?"
          >
            <p className="text-sm leading-relaxed">
              If you have questions about this policy or how your data is
              handled, open an issue on{" "}
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
                The only thing the developer can read is feedback you choose to
                send; it is kept for 180 days
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
            className="px-6 py-2 bg-ys-accent text-ys-on-accent font-medium rounded-lg transition-colors hover:opacity-90"
          >
            Back to Home
          </button>
        </div>
      </main>
    </div>
  );
}
