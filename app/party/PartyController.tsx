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
import { DEFAULT_JOIN_COLOR } from "../misc/multiplayer/palette";
import {
  DEFAULT_THEME_ID,
  THEME_PRESETS,
  applyThemeVars,
  findThemePreset,
} from "../story/themeTokens";

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

const card = "rounded-2xl border border-ys-border bg-ys-surface p-4";
const primaryButton =
  "w-full min-h-12 rounded-xl bg-ys-accent px-5 py-3 text-base font-semibold text-ys-on-accent active:opacity-90 disabled:opacity-40";
const secondaryButton =
  "min-h-11 rounded-xl border border-ys-border bg-ys-surface px-4 py-2 text-base text-ys-text active:bg-ys-surface-2 disabled:opacity-40";

// This phone's own colour theme (decision 140): the same key and presets as
// the app's Settings, written to this device's localStorage only. A phone
// opened from the QR code is its own origin, so it does not share the
// desktop's choice.
const THEME_KEY = "storyTheme";
const themeListeners = new Set<() => void>();

function subscribeTheme(cb: () => void): () => void {
  themeListeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    themeListeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function readThemeId(): string {
  try {
    return findThemePreset(localStorage.getItem(THEME_KEY)).id;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

function ThemePicker() {
  const themeId = useSyncExternalStore(subscribeTheme, readThemeId, () => DEFAULT_THEME_ID);
  const pick = (id: string) => {
    try {
      localStorage.setItem(THEME_KEY, id);
    } catch {
      // Private mode: the theme applies for this visit only.
    }
    applyThemeVars(findThemePreset(id));
    themeListeners.forEach((cb) => cb());
  };
  return (
    <details className="mt-auto pt-4 text-sm text-ys-muted">
      <summary className="cursor-pointer select-none py-2">Theme</summary>
      <div className="grid grid-cols-4 gap-2 pb-2">
        {THEME_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => pick(preset.id)}
            aria-pressed={themeId === preset.id}
            title={preset.name}
            className={`rounded-lg p-1 ${
              themeId === preset.id
                ? "ring-2 ring-ys-accent ring-offset-2 ring-offset-ys-bg"
                : "ring-1 ring-ys-border"
            }`}
          >
            <span
              className="flex aspect-square items-center justify-center rounded-md border border-ys-border text-xs font-medium"
              style={{ backgroundColor: preset.background, color: preset.text }}
            >
              Aa
            </span>
            <span className="mt-1 block truncate text-center text-[10px] text-ys-muted">
              {preset.name}
            </span>
          </button>
        ))}
      </div>
    </details>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-ys-bg text-ys-text">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))]">
        {children}
        <ThemePicker />
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
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-xl border border-ys-warning/40 bg-ys-surface px-4 py-3 text-sm text-ys-warning shadow-lg"
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
        <p className="text-ys-text">
          Scan the QR code on the table&apos;s screen to join. It opens this page with your link.
        </p>
      </Shell>
    );
  }

  if (state === "ended") {
    return (
      <Shell>
        <h1 className="mt-10 text-2xl font-semibold">Disconnected</h1>
        <div className={`${card} space-y-3 text-ys-text`}>
          <p>
            {socket.kickedReason?.includes("removed")
              ? "You were removed from the table."
              : "This seat is open on another screen, so this one was disconnected."}
          </p>
        </div>
        <button type="button" className={primaryButton} onClick={socket.retry}>
          Join again
        </button>
      </Shell>
    );
  }

  if (state === "failed") {
    return (
      <Shell>
        <h1 className="mt-10 text-2xl font-semibold">Can&apos;t reach the table</h1>
        <div className={`${card} space-y-3 text-ys-text`}>
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
        <p className="text-ys-text">
          {state === "reconnecting" ? "Reconnecting to the table…" : "Joining the table…"}
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      {state !== "open" && (
        <div role="status" className="rounded-xl bg-ys-warning/15 px-4 py-2 text-sm text-ys-warning">
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
  const [color, setColor] = useState(profile?.color ?? join?.palette[0] ?? DEFAULT_JOIN_COLOR);
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
        <p className="text-sm text-ys-muted">You&apos;re joining</p>
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
          <span className="text-sm text-ys-muted">Your name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={PARTY_MAX_NAME_CHARS}
            autoComplete="off"
            className="w-full min-h-12 rounded-xl border border-ys-border bg-ys-surface px-4 text-base text-ys-text"
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
        </label>
        <div className="space-y-1">
          <span className="text-sm text-ys-muted">Your colour</span>
          <div className="flex flex-wrap gap-3">
            {join.palette.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Colour ${c}`}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                className={`h-11 w-11 rounded-full border-2 ${color === c ? "border-ys-text" : "border-transparent"}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        <label className="block space-y-1">
          <span className="text-sm text-ys-muted">How do you like to play? (optional)</span>
          <select
            value={archetype}
            onChange={(e) => setArchetype(e.target.value)}
            className="w-full min-h-12 rounded-xl border border-ys-border bg-ys-surface px-3 text-base text-ys-text"
          >
            <option value="" className="text-ys-text">
              No preference
            </option>
            {join.archetypes.map((a) => (
              <option key={a.id} value={a.id} className="text-ys-text">
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
          <p className="truncate text-sm text-ys-muted">{view.storyName}</p>
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
                seat.id === view.spotlightHolderId ? "border-ys-accent bg-ys-surface-2" : "border-ys-border bg-ys-surface"
              } ${seat.connected ? "" : "opacity-50"}`}
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: seat.color }}
                aria-hidden="true"
              />
              {seat.name}
              {seat.id === view.spotlightHolderId && <span className="text-ys-warning">· spotlight</span>}
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
          <p className="text-sm text-ys-muted">Nothing yet. Lines from everyone appear here.</p>
        ) : (
          <ul className="space-y-1.5">
            {view.queue.map((line) => (
              <li key={line.id} className="text-sm">
                <span className="font-semibold" style={{ color: line.color }}>
                  {line.name}
                </span>{" "}
                <span className="break-words text-ys-text">{line.text}</span>
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
          <p className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap text-[15px] leading-relaxed text-ys-text">
            {view.narration}
          </p>
        </details>
      )}

      {view.sheet && (
        <details className={card}>
          <summary className="cursor-pointer text-base font-semibold">{view.sheet.title}</summary>
          <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-ys-text">
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
      <div className="flex min-h-14 items-center gap-3 rounded-xl border border-ys-border bg-ys-surface px-4">
        <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
          <circle cx="22" cy="22" r={radius} fill="none" className="stroke-ys-border" strokeWidth="4" />
          <circle
            cx="22"
            cy="22"
            r={radius}
            fill="none"
            className="stroke-ys-warning"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - fraction)}
            transform="rotate(-90 22 22)"
          />
        </svg>
        <p className="text-sm text-ys-text">
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
        <span className="text-sm text-ys-muted">{hint}</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={!enabled}
          rows={3}
          maxLength={PARTY_MAX_LINE_CHARS}
          className="w-full rounded-xl border border-ys-border bg-ys-surface px-4 py-3 text-base text-ys-text disabled:opacity-40"
        />
      </label>
      <button type="button" className={primaryButton} disabled={!enabled || !text.trim()} onClick={add}>
        Add to the queue
      </button>
      {choices.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-ys-muted">Or pick a suggestion</p>
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
    <section className={`${card} space-y-3 border-ys-warning/40`} aria-label="The GM asks you to roll">
      <h2 className="text-lg font-semibold">{request.title}</h2>
      {request.description && <p className="text-[15px] text-ys-text">{request.description}</p>}
      {request.formula && (
        <p className="font-mono text-sm text-ys-warning">Roll {request.formula}</p>
      )}
      <label className="block space-y-1">
        <span className="text-sm text-ys-muted">What did you roll?</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={200}
          inputMode="text"
          autoComplete="off"
          className="w-full min-h-12 rounded-xl border border-ys-border bg-ys-surface px-4 text-base text-ys-text"
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
  const complete = answers.every(
    (a) =>
      a.skipped || a.selectedLabel || (a.selectedLabels?.length ?? 0) > 0 || a.customText?.trim(),
  );
  // A multi-select question ticks and unticks; typing keeps the ticks.
  const toggle = (index: number, label: string) =>
    setAnswers((prev) =>
      prev.map((a, i) => {
        if (i !== index) return a;
        const current = a.skipped ? [] : (a.selectedLabels ?? []);
        const next = current.includes(label)
          ? current.filter((l) => l !== label)
          : [...current, label];
        return { selectedLabels: next, customText: a.customText, skipped: false };
      }),
    );

  return (
    <section className={`${card} space-y-5 border-ys-warning/40`} aria-label="The GM asks you a question">
      {request.questions.map((q, i) => (
        <div key={i} className="space-y-2">
          <h2 className="text-lg font-semibold">{q.question}</h2>
          {q.multiSelect && <p className="text-sm text-ys-muted">Pick as many as you like.</p>}
          <div className="flex flex-col gap-2">
            {q.options.map((option) => {
              const picked = q.multiSelect
                ? !answers[i].skipped && (answers[i].selectedLabels ?? []).includes(option.label)
                : answers[i].selectedLabel === option.label && !answers[i].skipped;
              return (
                <button
                  key={option.label}
                  type="button"
                  aria-pressed={picked}
                  className={`${secondaryButton} text-left ${picked ? "border-ys-accent bg-ys-accent/20" : ""}`}
                  onClick={() =>
                    q.multiSelect
                      ? toggle(i, option.label)
                      : set(i, { selectedLabel: option.label, skipped: false })
                  }
                >
                  <span className="block font-semibold">{option.label}</span>
                  {option.description && (
                    <span className="block text-sm text-ys-muted">{option.description}</span>
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
              onChange={(e) =>
                set(
                  i,
                  q.multiSelect
                    ? { selectedLabels: answers[i].selectedLabels, customText: e.target.value, skipped: false }
                    : { customText: e.target.value, skipped: false },
                )
              }
              className="w-full min-h-12 rounded-xl border border-ys-border bg-ys-surface px-4 text-base text-ys-text"
            />
          )}
          <button
            type="button"
            className="text-sm text-ys-muted underline"
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
