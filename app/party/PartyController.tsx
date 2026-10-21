"use client";

// The phone controller (docs/party-mode-design.md §4.3): a screen for one
// player at the table. It shows what that player may see and sends what they
// do; the desktop decides everything. It is its own small page: no story
// bundle, no icon set, no keys. It runs over plain HTTP from the desktop.

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePartySocket, type PartySocket } from "./usePartySocket";
import {
  PARTY_MAX_LINE_CHARS,
  PARTY_MAX_NAME_CHARS,
  type AnswerItem,
  type PartyRequestView,
  type PlayerView,
} from "../misc/party/protocol";

const PROFILE_STORAGE_KEY = "yourStoryPartyProfile";

interface Profile {
  name: string;
  color: string;
  archetype: string;
}

function loadProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

function saveProfile(profile: Profile): void {
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Next time the form starts empty.
  }
}

const noSubscription = () => () => {};

// The QR token, read without a hydration mismatch (the page is prerendered).
function useToken(): string | null {
  const search = useSyncExternalStore(
    noSubscription,
    () => location.search,
    () => "",
  );
  return new URLSearchParams(search).get("t");
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

const card = "rounded-2xl border border-white/10 bg-white/[0.04] p-4";
const primaryButton =
  "w-full min-h-12 rounded-xl bg-blue-500 px-5 py-3 text-base font-semibold text-white active:bg-blue-600 disabled:opacity-40";
const secondaryButton =
  "min-h-11 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-base text-blue-100 active:bg-white/10 disabled:opacity-40";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-[#0d1829] text-white">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))]">
        {children}
      </div>
    </main>
  );
}

function ToastBanner({ text }: { text: string }) {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setShown(false), 4500);
    return () => clearTimeout(id);
  }, []);
  if (!shown) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-xl border border-amber-300/30 bg-amber-950/95 px-4 py-3 text-sm text-amber-100 shadow-lg"
    >
      {text}
    </div>
  );
}

export default function PartyController() {
  const token = useToken();
  const socket = usePartySocket(token);
  const { view, state, toast } = socket;

  if (!token) {
    return (
      <Shell>
        <h1 className="mt-10 text-2xl font-semibold">Your Story</h1>
        <p className="text-blue-200/80">
          Scan the QR code on the table&apos;s screen to join. It opens this page with your link.
        </p>
      </Shell>
    );
  }

  if (state === "failed") {
    return (
      <Shell>
        <h1 className="mt-10 text-2xl font-semibold">Can&apos;t reach the table</h1>
        <div className={`${card} space-y-3 text-blue-100/90`}>
          <p>Check that this phone is on the same Wi-Fi as the computer running Your Story.</p>
          <p>
            If the table was closed and opened again, its link has changed: scan the QR code on the
            screen again.
          </p>
        </div>
        <button type="button" className={primaryButton} onClick={socket.retry}>
          Try again
        </button>
      </Shell>
    );
  }

  if (!view) {
    return (
      <Shell>
        <h1 className="mt-10 text-2xl font-semibold">Your Story</h1>
        <p className="text-blue-200/80">
          {state === "reconnecting" ? "Reconnecting to the table…" : "Joining the table…"}
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      {state !== "open" && (
        <div role="status" className="rounded-xl bg-amber-500/15 px-4 py-2 text-sm text-amber-100">
          Reconnecting to the table…
        </div>
      )}
      {view.me ? <Seated socket={socket} view={view} /> : <JoinForm socket={socket} view={view} />}
      {toast && <ToastBanner key={toast.id} text={toast.text} />}
    </Shell>
  );
}

// ---------------------------------------------------------------- joining

function JoinForm({ socket, view }: { socket: PartySocket; view: PlayerView }) {
  const join = view.join;
  const [profile] = useState<Profile | null>(() => loadProfile());
  const [name, setName] = useState(profile?.name ?? "");
  const [color, setColor] = useState(profile?.color ?? join?.palette[0] ?? "#22c55e");
  const [archetype, setArchetype] = useState(profile?.archetype ?? "");

  if (!join) return null;

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    saveProfile({ name: trimmed, color, archetype });
    socket.send({
      type: "join",
      name: trimmed,
      color,
      archetype: join.archetypes.some((a) => a.id === archetype)
        ? (archetype as (typeof join.archetypes)[number]["id"])
        : undefined,
    });
  };

  return (
    <>
      <header className="mt-6">
        <p className="text-sm text-blue-200/60">You&apos;re joining</p>
        <h1 className="text-2xl font-semibold">{view.storyName || "the table"}</h1>
      </header>

      {join.openSeats.length > 0 && (
        <section className={`${card} space-y-3`}>
          <h2 className="text-base font-semibold">Are you one of these players?</h2>
          <div className="flex flex-wrap gap-2">
            {join.openSeats.map((seat) => (
              <button
                key={seat.id}
                type="button"
                className={secondaryButton}
                style={{ borderColor: seat.color }}
                onClick={() => socket.send({ type: "join", name: "", color: "", seatId: seat.id })}
              >
                {seat.name}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className={`${card} space-y-4`}>
        <h2 className="text-base font-semibold">
          {join.openSeats.length > 0 ? "Or join as someone new" : "Who are you?"}
        </h2>
        <label className="block space-y-1">
          <span className="text-sm text-blue-200/70">Your name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={PARTY_MAX_NAME_CHARS}
            autoComplete="off"
            className="w-full min-h-12 rounded-xl border border-white/15 bg-white/5 px-4 text-base text-white"
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
        </label>
        <div className="space-y-1">
          <span className="text-sm text-blue-200/70">Your colour</span>
          <div className="flex flex-wrap gap-3">
            {join.palette.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Colour ${c}`}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                className={`h-11 w-11 rounded-full border-2 ${color === c ? "border-white" : "border-transparent"}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        <label className="block space-y-1">
          <span className="text-sm text-blue-200/70">How do you like to play? (optional)</span>
          <select
            value={archetype}
            onChange={(e) => setArchetype(e.target.value)}
            className="w-full min-h-12 rounded-xl border border-white/15 bg-white/5 px-3 text-base text-white"
          >
            <option value="" className="text-black">
              No preference
            </option>
            {join.archetypes.map((a) => (
              <option key={a.id} value={a.id} className="text-black">
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={primaryButton} disabled={!name.trim()} onClick={submit}>
          Join the table
        </button>
      </section>
    </>
  );
}

// ---------------------------------------------------------------- playing

function Seated({ socket, view }: { socket: PartySocket; view: PlayerView }) {
  const me = view.me!;
  const { send } = socket;
  const mySeat = view.seats.find((s) => s.id === me.id);
  const lockEnd = socket.viewAt + (mySeat?.lockoutMs ?? 0);
  // The clock only runs while a lockout does, so it can be older than the
  // view that reported one: never count from before the view arrived.
  const now = Math.max(useNow(lockEnd > socket.viewAt), socket.viewAt);
  const lockedMs = Math.max(0, lockEnd - now);
  const holder = view.seats.find((s) => s.id === view.spotlightHolderId) ?? null;
  const mine = holder?.id === me.id;
  const generating = view.turn === "generating";

  return (
    <>
      <header className="mt-2 flex items-center gap-3">
        <span
          className="inline-block h-4 w-4 shrink-0 rounded-full"
          style={{ backgroundColor: me.color }}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold">{me.name}</h1>
          <p className="truncate text-sm text-blue-200/60">{view.storyName}</p>
        </div>
      </header>

      {view.requests.map((request) => (
        <RequestCard key={request.requestId} request={request} send={send} />
      ))}

      <section className={`${card} space-y-3`}>
        <ul className="flex flex-wrap gap-2" aria-label="Players at the table">
          {view.seats.map((seat) => (
            <li
              key={seat.id}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${
                seat.id === view.spotlightHolderId ? "border-white/60 bg-white/15" : "border-white/10 bg-white/5"
              } ${seat.connected ? "" : "opacity-50"}`}
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: seat.color }}
                aria-hidden="true"
              />
              {seat.name}
              {seat.id === view.spotlightHolderId && <span className="text-amber-200">· spotlight</span>}
            </li>
          ))}
        </ul>
        <SpotlightButton
          mine={mine}
          holderName={holder?.name ?? null}
          lockedMs={lockedMs}
          cooldownMs={view.cooldownMs}
          onTake={() => send({ type: "spotlight_take" })}
          onRelease={() => send({ type: "spotlight_release" })}
        />
      </section>

      <Composer
        enabled={mine && !generating}
        hint={
          generating
            ? "The GM is working…"
            : mine
              ? "Type what you do or say"
              : "Take the spotlight to add a line"
        }
        choices={view.choices}
        onLine={(text, kind) => send({ type: "line", text, kind })}
      />

      <section className={`${card} space-y-3`}>
        <h2 className="text-base font-semibold">Waiting to go</h2>
        {view.queue.length === 0 ? (
          <p className="text-sm text-blue-200/60">Nothing yet. Lines from everyone appear here.</p>
        ) : (
          <ul className="space-y-1.5">
            {view.queue.map((line) => (
              <li key={line.id} className="text-sm">
                <span className="font-semibold" style={{ color: line.color }}>
                  {line.name}
                </span>{" "}
                <span className="break-words text-blue-100/90">{line.text}</span>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          className={primaryButton}
          disabled={generating || view.queue.length === 0}
          onClick={() => send({ type: "go" })}
        >
          {generating ? "The GM is working…" : "Go"}
        </button>
      </section>

      {view.narration && (
        <details open className={card}>
          <summary className="cursor-pointer text-base font-semibold">The story</summary>
          <p className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap text-[15px] leading-relaxed text-blue-50/90">
            {view.narration}
          </p>
        </details>
      )}

      {view.sheet && (
        <details className={card}>
          <summary className="cursor-pointer text-base font-semibold">{view.sheet.title}</summary>
          <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-blue-50/90">
            {view.sheet.content}
          </p>
        </details>
      )}
    </>
  );
}

function SpotlightButton({
  mine,
  holderName,
  lockedMs,
  cooldownMs,
  onTake,
  onRelease,
}: {
  mine: boolean;
  holderName: string | null;
  lockedMs: number;
  cooldownMs: number;
  onTake: () => void;
  onRelease: () => void;
}) {
  if (mine) {
    return (
      <button type="button" className={`${secondaryButton} w-full`} onClick={onRelease}>
        You have the spotlight · tap to let go
      </button>
    );
  }
  if (lockedMs > 0) {
    const radius = 18;
    const circumference = 2 * Math.PI * radius;
    const fraction = Math.min(1, lockedMs / Math.max(1, cooldownMs));
    return (
      <div className="flex min-h-14 items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4">
        <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
          <circle cx="22" cy="22" r={radius} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="4" />
          <circle
            cx="22"
            cy="22"
            r={radius}
            fill="none"
            stroke="#f59e0b"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - fraction)}
            transform="rotate(-90 22 22)"
          />
        </svg>
        <p className="text-sm text-blue-100">
          You were interrupted. You can take it back in {Math.ceil(lockedMs / 1000)} s.
        </p>
      </div>
    );
  }
  return (
    <button type="button" className={primaryButton} onClick={onTake}>
      {holderName ? `Take the spotlight from ${holderName}` : "Take the spotlight"}
    </button>
  );
}

function Composer({
  enabled,
  hint,
  choices,
  onLine,
}: {
  enabled: boolean;
  hint: string;
  choices: string[];
  onLine: (text: string, kind: "typed" | "choice") => void;
}) {
  const [text, setText] = useState("");
  const add = () => {
    const trimmed = text.trim();
    if (!trimmed || !enabled) return;
    onLine(trimmed, "typed");
    setText("");
  };
  return (
    <section className={`${card} space-y-3`}>
      <label className="block space-y-1">
        <span className="text-sm text-blue-200/70">{hint}</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={!enabled}
          rows={3}
          maxLength={PARTY_MAX_LINE_CHARS}
          className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-base text-white disabled:opacity-40"
        />
      </label>
      <button type="button" className={primaryButton} disabled={!enabled || !text.trim()} onClick={add}>
        Add to the queue
      </button>
      {choices.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-blue-200/70">Or pick a suggestion</p>
          <div className="flex flex-col gap-2">
            {choices.map((choice) => (
              <button
                key={choice}
                type="button"
                disabled={!enabled}
                className={`${secondaryButton} text-left`}
                onClick={() => onLine(choice, "choice")}
              >
                {choice}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- rolls and questions

function RequestCard({
  request,
  send,
}: {
  request: PartyRequestView;
  send: PartySocket["send"];
}) {
  return request.kind === "roll" ? (
    <RollCard request={request} send={send} />
  ) : (
    <QuestionCard request={request} send={send} />
  );
}

function RollCard({
  request,
  send,
}: {
  request: Extract<PartyRequestView, { kind: "roll" }>;
  send: PartySocket["send"];
}) {
  const [value, setValue] = useState("");
  return (
    <section className={`${card} space-y-3 border-amber-300/40`} aria-label="The GM asks you to roll">
      <h2 className="text-lg font-semibold">{request.title}</h2>
      {request.description && <p className="text-[15px] text-blue-100/90">{request.description}</p>}
      {request.formula && (
        <p className="font-mono text-sm text-amber-200">Roll {request.formula}</p>
      )}
      <label className="block space-y-1">
        <span className="text-sm text-blue-200/70">What did you roll?</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={200}
          inputMode="text"
          autoComplete="off"
          className="w-full min-h-12 rounded-xl border border-white/15 bg-white/5 px-4 text-base text-white"
        />
      </label>
      <button
        type="button"
        className={primaryButton}
        disabled={!value.trim()}
        onClick={() => send({ type: "roll_result", requestId: request.requestId, value: value.trim() })}
      >
        Send my roll
      </button>
      <button
        type="button"
        className={`${secondaryButton} w-full`}
        onClick={() => send({ type: "roll_result", requestId: request.requestId, value: null })}
      >
        Roll for me
      </button>
    </section>
  );
}

function QuestionCard({
  request,
  send,
}: {
  request: Extract<PartyRequestView, { kind: "question" }>;
  send: PartySocket["send"];
}) {
  const [answers, setAnswers] = useState<AnswerItem[]>(() =>
    request.questions.map(() => ({ skipped: false })),
  );
  const set = (index: number, answer: AnswerItem) =>
    setAnswers((prev) => prev.map((a, i) => (i === index ? answer : a)));
  // A question is answered once it has a pick, some text, or is skipped.
  const complete = answers.every((a) => a.skipped || a.selectedLabel || a.customText?.trim());

  return (
    <section className={`${card} space-y-5 border-amber-300/40`} aria-label="The GM asks you a question">
      {request.questions.map((q, i) => (
        <div key={i} className="space-y-2">
          <h2 className="text-lg font-semibold">{q.question}</h2>
          <div className="flex flex-col gap-2">
            {q.options.map((option) => {
              const picked = answers[i].selectedLabel === option.label && !answers[i].skipped;
              return (
                <button
                  key={option.label}
                  type="button"
                  aria-pressed={picked}
                  className={`${secondaryButton} text-left ${picked ? "border-blue-400 bg-blue-500/20" : ""}`}
                  onClick={() => set(i, { selectedLabel: option.label, skipped: false })}
                >
                  <span className="block font-semibold">{option.label}</span>
                  {option.description && (
                    <span className="block text-sm text-blue-200/70">{option.description}</span>
                  )}
                </button>
              );
            })}
          </div>
          {q.allowCustom && (
            <input
              value={answers[i].customText ?? ""}
              placeholder="Or answer in your own words"
              maxLength={PARTY_MAX_LINE_CHARS}
              onChange={(e) => set(i, { customText: e.target.value, skipped: false })}
              className="w-full min-h-12 rounded-xl border border-white/15 bg-white/5 px-4 text-base text-white"
            />
          )}
          <button
            type="button"
            className="text-sm text-blue-200/60 underline"
            onClick={() => set(i, { skipped: true })}
          >
            {answers[i].skipped ? "Skipped" : "Skip this one"}
          </button>
        </div>
      ))}
      <button
        type="button"
        className={primaryButton}
        disabled={!complete}
        onClick={() => send({ type: "answer", requestId: request.requestId, answers })}
      >
        Send my answers
      </button>
    </section>
  );
}
