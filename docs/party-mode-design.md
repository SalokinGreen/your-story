# Party mode — design

**Status:** draft for the author's review, 2026-10-21. Not approved to build.
Decisions 21–25 in [`decisions.md`](decisions.md). Implementation plan:
[`party-mode-implementation-plan.md`](party-mode-implementation-plan.md).

## 1. What it is

The desktop app becomes the **table**: a shared screen that shows the story.
Every player plays from **their own phone**, which becomes a **controller**
for their character (decisions 21, 22). The desktop shows a QR code; a phone
that scans it either opens the Android app (if installed) or a phone web client
that the desktop itself serves over the home network. No internet service, no
public website, and no API keys on the phones.

The couch-co-op spotlight rule carries over: a player taps to take the
spotlight, and whoever they took it from is locked out for a cooldown before
they can take it back — about **15 seconds** in party mode, as a setting
(decision 24). Lines queue on the table and **anyone taps "Go"**, on a phone or
the desktop, to send the turn to the GM (decision 23).

Later, an **auto-voice mode** gives the spotlight to whoever is speaking (§7).

## 2. Out of scope

- **Auto-voice** — designed for (§7), not built now.
- **Playing from outside the home network.** That is the existing online
  multiplayer; it stays as it is.
- **Players at the desktop itself.** In party mode everyone plays from a phone;
  the desktop is the table and the host's controls.
- **An iOS app path.** iPhones join through the browser client like any phone
  without the app (Safari has no way to hand a web page to an app on a LAN).
- **Voice in the browser client** (decision 25).

## 3. What exists today, and why party mode needs its own connection

From a code map of master at `b864251`:

- **The spotlight is a microphone "talking stick"** (`multiplayer/floorControl.ts`):
  one holder at a time, last tap wins, and the player whose recording was
  taken over is locked out for `FLOOR_STEAL_COOLDOWN_MS = 4000`. It gates only
  who may record; typing and choice chips ignore it. On one device the bubbles
  in `PlayerBubbles.tsx` drive it; voice takes are transcribed and **queued**,
  and a "Generate" bubble sends the queue as one turn (`> Name: text` lines plus
  `speakerIds`).
- **The player-spotlight ledger** (`couchPlayerFocus`, `playerStyleCounts`,
  written in `handleCustomInput`) feeds the director's `spotlight_couch_player`
  move. Party mode keeps using it unchanged.
- **Online multiplayer cannot carry party mode.** All its transports need public
  internet servers for signalling (torrent trackers, Nostr and MQTT relays, the
  PeerJS broker), and Trystero needs `crypto.subtle`, which a plain-HTTP page on
  the home network does not have. Online guests also get the host's full
  `StoryData`, GM secrets included, and cannot answer `ask_question` or
  `ask_for_roll` (status report §6.12).

So party mode gets its own small connection: **the desktop runs a local server,
and phones connect to it directly over the home Wi-Fi.**

## 4. How it works

### 4.1 The desktop's local server

The Tauri app starts a small server only while party mode is open:

- it serves the **phone client** (a page in the same static export) and a
  **WebSocket** for live messages, on the PC's home-network address and a fixed
  port with a fallback;
- it is a **relay**: phone messages go to the game running in the desktop's
  window, and the game decides what each phone is told. All game logic stays in
  the desktop's TypeScript, as it does today;
- every connection must present the **session token** from the QR code, come
  from a private-network address, and pass an `Origin` check;
- it serves the static export read-only and nothing else.

### 4.2 Joining

The QR code holds a plain web address, `http://<PC's IPv4>:<port>/party?t=<token>`.
The URL and a short code are also shown as text, for anyone whose camera won't
scan.

- **No app:** the phone's browser opens the phone client from the desktop.
  The player picks a name, colour and archetype, as in couch co-op.
- **Android app installed:** the browser page shows an **"Open in app"** button
  (Chrome's `intent://` link, which falls back to the web client if the app
  isn't there). The app also gets its own **"Scan to join"** button, using
  Google's code scanner, so app users never touch the browser.

A phone that sleeps or drops reconnects with its token and player id.

### 4.3 What each phone shows (decision 22)

The phone is a controller, not a copy of the game:

- the player's own name, colour and, once the GM has written it, their
  **character sheet** (the `character_sheet` note owned by that player);
- the **spotlight button**, the current holder, and a ring counting down any
  cooldown;
- **text input**, and **voice input in the Android app** (decision 25);
- the **queue** of lines waiting to go, and the **Go** button;
- the **suggested choices**, when the story has them on;
- **rolls and questions addressed to that player**: when the GM calls
  `ask_for_roll` or `ask_question` naming a player, the prompt appears on that
  player's phone, which also fixes this gap for party play.

Each phone gets a view built for it alone. It never receives `StoryData`,
secrets, the campaign plan, hidden notes, or anyone's API keys.

### 4.4 The spotlight in party mode

The same rule as couch co-op, from `floorControl.ts`, with the cooldown as a
setting (default 15 s, decision 24):

- tap **Take the spotlight**: you hold it; whoever had it is locked out for the
  cooldown;
- while you hold it you can **add lines** — typed, or spoken in the app;
- release it, or let someone take it.

Open question 1 asks whether the spotlight should gate typed lines and choice
taps too (this design's default) or only voice, as on the couch today.

### 4.5 Turns (decision 23)

Lines queue on the table screen, each labelled with its player. Anyone taps
**Go**, on a phone or the desktop, and the queue goes to the GM exactly as the
couch "Generate" bubble sends it today: `> Name: line` text, `speakerIds`, and
the voice tag for spoken lines. The spotlight ledger and the director's
spotlight move then work unchanged.

### 4.6 Voice from the app

The app records on the phone, and sends the audio to the desktop. **The desktop
transcribes it** with its own Mistral key, as the bubbles do today, and the
line joins the queue. Phones need no keys.

### 4.7 The table screen

In party mode the desktop's story page:

- shows the **QR code, URL and code** in a lobby panel, and again from a
  "Join" button at any time;
- replaces the bubbles with a **player strip**: who is connected, who holds the
  spotlight, who is cooling down;
- shows the **queue** and its **Go** button;
- keeps everything else (the story, TTS, the menu) as it is.

## 5. Platform requirements

- **Windows Firewall.** The first time the app listens on the network, Windows
  asks. The app explains this *before* starting the server ("allow on private
  networks"). It detects the cases where phones can't connect — the Wi-Fi is
  marked Public, the port is reserved (error 10013), or the rule was declined —
  and shows how to fix each. A firewall rule created by the installer is a
  later improvement.
- **The home network.** Phones must be on the same Wi-Fi as the PC. Guest
  networks with client isolation block it; the lobby says so.
- **The Android app.** It runs as a secure `https://localhost` page, so a plain
  WebSocket to the PC would be blocked as mixed content. The app uses a
  **native WebSocket** (a Capacitor plugin) instead, which keeps the app's
  origin and its saved stories. It also needs cleartext allowed for the home
  network, the microphone permissions, and a custom-scheme intent filter for
  "Open in app".
- **The browser client** works on plain HTTP: no microphone, no
  `crypto.subtle`, no clipboard API. It uses `crypto.getRandomValues` and the
  token the desktop issues.

## 6. Security and privacy

- The server runs only while party mode is open, on the home-network address
  only, and refuses anything without the session token, from a non-private
  address, or from the wrong origin.
- Phones get per-player views: no secrets, no plan, no keys (§4.3).
- Audio goes from the phone to the desktop and then to Mistral for
  transcription, the same path as couch voice today.

## 7. Later: auto-voice (designed for, not built)

Each phone in the app runs voice-activity detection (Silero VAD through
`@ricky0123/vad-web`, with its files bundled, not fetched from a CDN) and sends
only small features — a timestamp, a speech probability and a loudness level —
never continuous audio. The desktop gives the spotlight to the phone whose
player is clearly speaking above their own calibrated noise floor, with a
margin and hysteresis so it doesn't flicker, and marks overlaps as ambiguous.
It pauses while the desktop's own TTS is speaking, since every phone hears it.
Tap-to-take stays as the fallback. The party protocol reserves a message for
these features now, so adding the mode later changes no message shapes.

## 8. Open questions for the author

1. **Does the spotlight gate typed lines and choice taps too?** This design's
   default is yes: in party mode you need the spotlight to add anything. The
   alternative is today's couch rule, where it gates only voice.
2. **Should the desktop show a QR again mid-game** for late joiners? Default:
   yes, from a "Join" button; late joiners start with an empty queue.
