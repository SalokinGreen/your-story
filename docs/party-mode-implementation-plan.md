# Party mode — implementation plan

**Status:** approved to build, 2026-10-21 (decision 28).
Design: [`party-mode-design.md`](party-mode-design.md). Decisions 21–28. File
references come from a code map of master at `b864251`. Line numbers are
approximate (`~`); re-check them before editing.

## 0. Shape of the work

Three pull requests, each one playable on its own:

1. **PR P1: the desktop table and the browser controller (slices S0–S6).** A
   party played entirely from phone browsers: typing, choices, the
   spotlight, Go, rolls and questions. This is most of the work.
2. **PR P2: the Android app joins (slices S7–S9).** The in-app scanner, "Open
   in app", the native WebSocket and voice from the app.
3. **PR P3: polish (S10).** An installer-made firewall rule, a QR for late
   joiners, and anything the first real party turns up.

Auto-voice comes later, in its own plan (design §7).

**The key choice:** all game logic stays in the desktop's TypeScript. Rust only
serves files and relays messages. The phone client is a separate, small page in
the same static export, `/party`, with its own minimal code. It does not run
`/story`.

**Sequencing:** PR P1 touches `story/page.tsx`, `story.tsx` and
`PlayerBubbles.tsx`. The Claude-GM build session is touching `providerFetch`
and `providerCall`, which don't overlap with this. PR #204 (`generation.ts`,
`layerSettings.ts`) should merge first.

## 1. PR P1: the desktop table and the browser controller

### S0. Spike: needs the author and a phone (the author's go)

Before any real code, a throwaway Rust binary checks:

- it serves `out/` and a WebSocket echo on the LAN IP;
- a phone on the same Wi-Fi loads the page and round-trips a message;
- what the Windows Firewall prompt does;
- whether `out/` works served from an origin root, with `/party` mapped to
  `party.html` and the root-absolute `/_next/...` and `/assets/...` paths
  intact.

Record the findings in a dated section at the end of this file. If phones
can't reach the PC on the author's network, stop and report before building
the rest.

### S1. The Rust LAN server

**Files:**

- `src-tauri/Cargo.toml`: add `axum` (feature `ws`), `tower-http` (feature
  `fs`), `tokio` (features `net`, `sync`, `macros`), `local-ip-address`,
  `rand`.
- `src-tauri/src/party_server.rs`: new.
- `src-tauri/src/lib.rs`: managed state, commands.
- `src-tauri/build.rs` and `capabilities/default.json`: permission for the
  commands, for window `main` only.

**Commands:**

```rust
#[tauri::command] async fn party_start(opts: PartyStartOpts, on_event: Channel<PartyEvent>,
                                        state: State<'_, PartyServer>) -> Result<PartyInfo, String>;
// PartyStartOpts { preferred_port: u16 /* 8787 */, interface_ip: Option<String> }
// PartyInfo { url: String /* http://ip:port/party?t=… */, ip: String, port: u16, token: String,
//             interfaces: Vec<NetInterface> /* for a picker */ }
#[tauri::command] async fn party_send(to: PartyTarget /* All | Client(String) */, json: String,
                                       state: State<'_, PartyServer>) -> Result<(), String>;
#[tauri::command] async fn party_kick(client_id: String, state: State<'_, PartyServer>) -> Result<(), String>;
#[tauri::command] async fn party_stop(state: State<'_, PartyServer>) -> Result<(), String>;
// PartyEvent: Connected{client_id, user_agent} | Message{client_id, json} | Disconnected{client_id}
//             | Error{code /* PORT_RESERVED | BIND_FAILED | … */, message}
```

**Rules:**

- Bind to the chosen interface IP. Prefer the default-route interface, and
  list the others for a picker, since VPN, WSL and Hyper-V adapters exist.
- On WSAEACCES (10013) or "address in use", try the next port in a small range.
- The token is 128 bits from `rand`.
- A WebSocket upgrade needs `?t=<token>`, an `Origin` equal to
  `http://<ip>:<port>` or the Android app's origin, and a remote address in
  10/8, 172.16/12, 192.168/16 or 169.254/16. Anything else gets 403.
- Static files come from the app's bundled frontend via `asset_resolver()`.
  Map `/party` to `party.html`. Serve no other paths outside the export.
- Limit message size to 256 KB, enough for a voice take, which S8 sends as
  chunks.

**Tests:** `cargo test` for the token, origin and private-range checks, port
fallback and path mapping.

### S2. The party protocol and the host state machine (TypeScript, pure)

**New: `app/misc/party/protocol.ts`**, which defines the message types.

From phone to desktop:
- `hello{token, playerId?}`
- `join{name, color, archetype?, tags?}`
- `spotlight_take` / `spotlight_release`
- `line{text, kind: "typed" | "choice"}`
- `voice_chunk{takeId, seq, base64, last}`
- `go`
- `roll_result{requestId, value}`
- `answer{requestId, text}`
- `vad_features{…}`, reserved for auto-voice and ignored for now
- `ping`

From desktop to phone:
- `welcome{playerId, view}`
- `view{…}`, a full per-player view, sent on every change; it's small
- `toast{text}`
- `pong`

**New: `app/misc/party/partyHost.ts`**, a pure state machine with no React,
so it's testable.

```ts
export interface PartyHostState { players: PartyPlayer[]; floor: FloorState; cooldownMs: number;
  queue: QueuedLine[]; turn: "idle" | "generating"; requests: PartyRequest[] }
export function createPartyHost(opts: { cooldownMs: number }): PartyHostState;
export function handlePhoneMessage(s: PartyHostState, clientId: string, msg: PhoneMessage,
  now: number): { state: PartyHostState; effects: PartyEffect[] };
// PartyEffect: SendView(clientId) | Broadcast | SubmitTurn{text, speakerIds, kind}
//            | Transcribe{playerId, audio} | Toast(clientId, text)
export function buildPlayerView(s: PartyHostState, story: StoryData, playerId: string): PlayerView;
```

**Rules:**

- Use `floorControl.ts` for the spotlight. Give `takeFloor` a `cooldownMs`
  parameter, defaulting to today's 4000, so couch mode is unchanged.
- A `line` (typed or a choice tap) or a voice take is accepted only from the
  spotlight holder (decision 26).
- `go` from anyone turns the queue into one `SubmitTurn`, built exactly as
  `PlayerBubbles` builds its Generate payload today: `> Name: text` joined by
  newlines, unique `speakerIds`, and `kind: "voice"` if any line was spoken.
- The queue is locked while a turn is generating.
- **`buildPlayerView` is the redaction boundary.** It returns only:
  - the player's own name and colour;
  - their own `character_sheet` note, found by `ownerCouchPlayerId`, or else
    by the title "Character: <name>" that the setup note tells the GM to use;
  - the roster with spotlight and cooldown state;
  - the queue;
  - the turn state;
  - the suggested choices;
  - this player's pending requests;
  - the latest narration excerpt.

  It never returns `StoryData`, other players' sheets, notes of type
  `secret`, `gm_plan` or `dm_instructions`, notes not set to `always_reveal`,
  or any key.

**Refactor:** move the couch queue-to-payload builder out of
`PlayerBubbles.tsx` (~`:325-333`) into `app/misc/party/turnText.ts`, so couch
and party share it.

**Tests:**

- `tests/party.host.test.ts`:
  - joining and the roster;
  - spotlight take and steal with a 15 s cooldown, and the denied-steal toast;
  - a line from a non-holder is refused;
  - Go builds the same text and `speakerIds` as the couch builder;
  - the queue is locked while generating;
  - a reconnect with the same player id keeps the seat.
- `tests/party.redaction.test.ts`: a story with a secret, a `gm_plan` note, a
  hidden note and another player's sheet. None of them appear in the view
  JSON.
- `tests/party.turnText.test.ts`: the extracted builder gives byte-identical
  output to today's.

### S3. The desktop table screen

**Files:**

- `app/story/page.tsx`: a `usePartyHost` hook (new file,
  `app/story/usePartyHost.ts`) that owns the state machine and runs its
  effects:
  - `SubmitTurn` goes to `handleCustomInput(text, undefined, speakerIds, kind)`
    (`page.tsx:~1853`);
  - `Transcribe` goes to the existing STT path (`sttFetch`) with the desktop's
    Mistral key, then becomes a queued line;
  - `SendView` and `Broadcast` go to `party_send`.
- `app/story/story.tsx` (~`:1635-1654`): in party mode, render a
  `PartyTableStrip` instead of `PlayerBubbles`.
- New `app/components/PartyLobby.tsx`: the QR code (`qrcode.react`
  `QRCodeSVG`; add the dependency), the URL and code as text, a network-interface
  picker, the explanation shown before the firewall prompt, and the
  error help (Public network, port reserved, client isolation).
- New `app/components/PartyTableStrip.tsx`: the players, spotlight and
  cooldown rings, the queue and the Go button.
- `app/story/menu/OnlinePlayEditor.tsx`, or a new `PartyModeEditor.tsx` in the
  Menu: start and stop party mode, and the cooldown setting
  (`partySpotlightCooldownMs`, default 15000, kept in localStorage).
- Late joiners: a "Join" button on the table screen shows the lobby QR again at any time (decision 27).
- The roster: party joins add `CouchPlayer` entries the way online joins do
  (`page.tsx:~767-802`), so the GM prompt's player lines, the setup note and
  the spotlight ledger all see party players.

**Rolls and questions:** where the host opens `ManualRollModal` or
`AskQuestionModal` for a named player (`page.tsx:~3405-3433`, `~5186-5199`),
send a request to that player's phone instead, if they are a party player. The
first answer resolves the same promise the modal would. The desktop keeps a
small "waiting for Mara's roll" notice with a fallback "Answer here" button.

### S4. The phone controller page

**New:**

- `app/party/page.tsx`, a route in the static export (`out/party.html`).
- `app/party/PartyController.tsx`.
- `app/party/usePartySocket.ts`: WebSocket client, reconnect with backoff,
  ping every 10 s.

It's built for a phone screen:

- a join form with name, colour (the couch palette) and archetype;
- your sheet;
- a large **spotlight** button with a cooldown ring;
- a text box;
- choice chips;
- the queue and **Go**;
- a roll prompt: enter what you rolled, or tap "Roll for me", which asks the
  desktop to roll;
- a question prompt.

The page uses no `crypto.subtle`, no `crypto.randomUUID`, no clipboard API
and no service worker. Ids come from `crypto.getRandomValues`. The player id
is kept in the phone's localStorage for reconnects.

**Check:** the page must not import the `/story` bundle, so its size stays
small. Build it and record the chunk size.

### S5. Wiring the static server's paths

Confirm in S0 that `/party?t=…` loads `party.html` with its `/_next/...`
assets, and fix the S1 path mapping if needed. `next.config.ts` needs no
`basePath`.

### S6. Docs for P1

- `CLAUDE.md` Architecture: party mode, the redaction boundary as a rule, and
  "Rust only relays".
- `docs/pending_tests.md`: the multi-phone checks (§4).
- A dated "decisions made during implementation" section here.

**PR P1 is done when:**

- `npx vitest run`, `npx tsc --noEmit`, `cargo test` and
  `node scripts/build-standalone.mjs` all pass;
- the `engine-review` agent has reviewed the diff;
- `RUSTUP_TOOLCHAIN=1.99.1 npx tauri build` passes;
- the built app starts a party and the lobby shows a QR code;
- with the author's go and phones, a two-phone party plays a turn.

## 2. PR P2: the Android app joins

### S7. Joining from the app

- `package.json`: add `@capacitor/app` and `@capacitor-mlkit/barcode-scanning`
  (8.x, Google code scanner, no camera permission).
- **Native WebSocket:** check whether a maintained Capacitor 8 WebSocket plugin
  exists. If not, write a small local plugin
  (`android/app/src/main/java/.../PartySocketPlugin.java`, OkHttp
  `WebSocket`) with a TypeScript wrapper behind the same interface as
  `usePartySocket`.
- `AndroidManifest.xml`:
  - an intent filter (`VIEW`, `DEFAULT`, `BROWSABLE`, scheme
    `com.yourstory.app`);
  - `RECORD_AUDIO` and `MODIFY_AUDIO_SETTINGS`;
  - a network security config allowing cleartext only as needed. It can't be
    scoped to IP ranges, so it goes in `base-config`, and the plan records
    that trade-off.
- The app shell gets a **"Scan to join"** button (home and library) that reads
  the QR's `http://…/party?t=…` URL and opens the bundled `/party` route, with
  the host and token as parameters and the native socket underneath.
- `appUrlOpen` and `getLaunchUrl` handle "Open in app" from the browser.

### S8. Voice from the app

The app records with the existing `PlayerBubbles` capture code (MediaRecorder,
silence detection), moved into a shared hook. Takes are sent as
`voice_chunk` messages. The desktop puts the chunks back together and
transcribes them. Voice is only offered when the phone is in the app
(`Capacitor.isNativePlatform()`).

### S9. The browser's "Open in app" button

`/party` on an Android browser shows **Open in app** (an `intent://` URL whose
`browser_fallback_url` is the same page) beside **Play in browser**.

**PR P2 is done when:**

- the suite and `tsc` pass;
- the Android debug APK builds locally (the SDK is now installed:
  `C:\Users\Nikolas\AppData\Local\Android\Sdk`, JDK from Android Studio's
  `jbr`);
- with the author's phone: scan, join, take the spotlight, speak a line, and
  Go.

## 3. PR P3: polish (S10)

- Create a Windows Firewall rule at install time, scoped to private networks
  and the local subnet. This needs the NSIS hooks, and a per-machine install
  to get elevation.
- Whatever the first real party turns up.

## 4. Tests that need people and phones

These go to `docs/pending_tests.md`:

- two or more phones, a mix of browser and app;
- a steal and its cooldown, seen on both phones;
- Go from a phone, and Go from the desktop;
- a roll and a question routed to the right phone;
- a phone sleeping and reconnecting;
- a secret note never appearing on any phone (check its view in the
  browser's dev tools);
- the Windows Firewall prompt on a fresh install;
- a guest Wi-Fi network showing the "client isolation" help.

## 5. What could break, and the check that catches it

| risk | check |
|---|---|
| Phones can't reach the PC (firewall, Public network, isolation) | S0 on the author's network, then the lobby's diagnostics |
| A secret leaks to a phone | `party.redaction.test.ts`; `buildPlayerView` is the only builder of phone payloads |
| The couch queue's text changes when extracted | `party.turnText.test.ts`, byte for byte |
| Couch mode's 4 s cooldown changes | `takeFloor` keeps its default; `floorControl.test.ts` stays green |
| The phone page drags in the whole `/story` bundle | its chunk size, measured in S4 |
| The Android WebView blocks the socket | the native plugin in S7; checked with the author's phone |
| An open port on a café Wi-Fi | the server runs only while party mode is open; the token, private-range and origin checks in S1 |

## 6. Deliberately not built now

Auto-voice; an iOS app path; play from outside the home network; players
at the desktop itself; voice in the browser client.

## 7. S0 findings (2026-10-21)

**Passed: a phone reaches the PC.** The author ran the spike, a throwaway
axum binary, on this PC. It served the static export, a `/party` echo page
and `/ws` (with the token, Origin and private-range checks), and logged
every request with its peer address. The author then scanned a QR code with
an Android 10 phone running Chrome 155. The spike was built first, but run
only after S2 had been written (decision 31).

- **Reach.** The phone (Wi-Fi, `192.168.0.253`) loaded `/party` from the
  PC (wired, `192.168.0.85`). No client isolation on this network.
- **The WebSocket.** It upgraded with `Origin: http://192.168.0.85:8787`,
  exactly the `http://<ip>:<port>` the check expects. The hello and two taps
  were echoed. The first socket closed when the page was reloaded, so
  reconnecting matters (S4).
- **Choosing the interface.** `local_ip()` picked `192.168.0.85`. The PC
  also has Tailscale (`100.122.14.19`), a Bluetooth PAN (`169.254.39.80`)
  and an IPv4-less adapter with a default route to `25.0.0.1`. The
  default-route choice was right here, and the picker stays for other PCs.
- **Windows Firewall.** The first listen raised the prompt. The rules it
  created allow inbound TCP and UDP for that exe on **Private and Public**,
  so the lobby must say "tick Private networks only". The rules are tied to
  the exe's path, so the installed `app.exe` will get its own prompt.
- **Serving the export from the root (S5).** With `/<path>` mapped to
  `<path>.html`, `/` and `/library` loaded with every `/_next/static/...`
  chunk, font and stylesheet returning 200. No `basePath` is needed.
- **One harmless 404.** Next's client-side prefetch asked for
  `HEAD /creator` and `/creator/__next._tree.txt` (200), then
  `/creator/__next.creator.__PAGE__.txt` (404, a segment file the export
  doesn't write). The phone page links nowhere, so the real server serves
  only `/party`, `/_next/...` and the favicon.
- **Running it.** The permission classifier won't let a session open a LAN
  port ("Expose Local Services"), so the author starts the server.
  `.cmd`/PowerShell quoting tripped up the first attempt; a launcher with no
  spaces in its path worked. Build with `CARGO_TARGET_DIR` set to a short
  path: under the session scratchpad, `link.exe` fails with LNK1104 once
  the path passes 260 characters.

## 8. Decisions made during implementation

### 2026-10-21, S2

- **Seats need a key to reconnect.** `hello` reclaims a seat only with its
  `playerId` and a `seatKey` that is sent only to that phone (in its own
  view's `me`). The roster every phone sees lists seat ids, so an id alone
  would let any phone take any seat. A newer connection with the right key
  wins the seat, and the stale socket is kicked: a phone back from sleep can
  arrive before its old socket is noticed as dead.
- **Phones can claim an open seat.** `join{seatId}` takes over a seat from
  the story's existing roster, or a seat whose phone dropped, so a couch
  story continued in party mode doesn't get a second Mara. Seat keys last one
  party session; after the desktop restarts party mode, a returning phone
  taps its name under the open seats.
- **Line breaks in typed lines and names become spaces.** Otherwise a phone
  could forge a `> Tom: …` line inside the turn text. This happens when a
  line is taken in, before `buildTurnText`, which stays byte-identical to the
  old builder.
- **`answer` carries one item per question,**
  `{selectedLabel?, customText?, skipped}[]`, rather than the plan's single
  `text`. `ask_question` batches one to three questions with options. Only a
  label the GM offered counts as a pick, and custom text counts only where
  `allow_custom` isn't false.
- **"Roll for me" is `roll_result{value: null}`.** It resolves the existing
  manual-roll promise with null, the executor's "skipped, roll it digitally"
  path. No new roll path.
- **Go needs no spotlight.** Any seated phone or the desktop can tap it
  (decision 23 says "anyone"). It needs a non-empty queue and no turn in
  progress, and it sets the turn to generating at once, so a double tap can't
  submit twice.
- **What "the queue locks" means.** While a turn is generating there are no
  new lines (typed, choice, or the start of a voice take) and no Go. A voice
  take that was accepted before the turn started still queues once it is
  transcribed, and waits for the next Go.
- **A phone with no seat gets a lobby view.** It holds the roster, the
  palette, the archetype labels and the open seats, and no narration, sheet,
  queue or choices. The phone page then needs no app imports beyond the
  protocol's types. The palette moved to `app/misc/multiplayer/palette.ts`,
  and `CouchPlayersEditor` re-exports it.
- **`buildPlayerView` takes `now`.** Lockouts are sent as milliseconds
  remaining, because a phone's clock isn't the desktop's.
- **The player's sheet** is chosen only from `character_sheet` notes that
  are on, not flagged `secrtet` and `always_reveal`. The note owned through
  `ownerCouchPlayerId` wins over a "Character: <name>" title.
- **Limits:** 8 seats, 20 queued lines, 1,000 characters a line, 32
  characters a name, and 10 MB for a voice take.

### 2026-10-21, S1 (the Rust server)

- **No `tower-http`, no `rand` 0.9.** The plan listed `tower-http` for files,
  but the files come from the app's bundle through `asset_resolver()`, so
  there is nothing for it to serve. `rand` is 0.10, the version Tauri's
  lockfile already held. `axum` is built without default features
  (`ws`, `http1`, `tokio`, `query`).
- **The static handler serves only three kinds of path:** `/party` (and
  `/party.html`), `/favicon.ico` and `/_next/static/*`. The spike served any
  exported file; the real server doesn't, so the rest of the app (the
  library, the creator, themes) is never reachable from a phone. Tauri's
  resolver falls back to `index.html` for a missing path, so the handler
  checks the path against the bundle's own asset keys first and answers 404
  instead of handing the app's home page to a stray request.
- **Origins.** The WebSocket accepts exactly `http://<ip>:<port>` and, for
  PR P2, the Android app's `https://localhost`. A missing Origin is refused;
  every phone browser sends one.
- **Port fallback is ten ports** from 8787. A taken or reserved port (error
  10013) tries the next; any other bind error stops at once. The lobby
  explains `PORT_RESERVED`, `PORT_IN_USE` and `NO_NETWORK`.
- **Interfaces.** Only private IPv4 addresses count (10/8, 172.16/12,
  192.168/16): link-local 169.254.x (the Bluetooth PAN here) and Tailscale's
  100.x are left out. If the default route isn't on a home network (a VPN),
  the first home-network address stands in for it.
- **Backpressure.** Each phone has a 64-message queue; a phone that stops
  reading is dropped rather than buffered. At most 16 phones connect.
- **Events.** `PartyEvent::Error` is sent when the listener dies while the
  table is open (`SERVER_FAILED`); the runtime then closes the table and the
  lobby says so.
- **Permissions** are generated per command by an app manifest in `build.rs`
  (`allow-party-start` and so on) and granted in `capabilities/default.json`,
  which is for the `main` window only. The generated files in
  `src-tauri/permissions/autogenerated/` are committed.

### 2026-10-21, S3 (the desktop table)

- **The logic is a plain class, `PartyRuntime`, not hook code,** so it is
  tested end to end with a fake server (`tests/party.runtime.test.ts`). The
  hook is thin.
- **A claimed seat belongs to the party** (changed from S2). A roster sync
  that no longer lists a seat a phone claimed this session, such as an undo
  to a `StoryData` from before the player joined, does not remove the seat
  or kick the phone: it writes the seat back into the story. Unclaimed seats
  follow the story's roster, and removing a player on purpose is the strip's
  "x" (`removeSeat`), which kicks the phone and removes the seat from the
  story.
- **Where a roll or question goes.** The named player if they are on a phone
  (`player_name`, `target_player_name`); if the GM names nobody, whoever holds
  the spotlight; otherwise, and for a batch naming different players, the
  desktop modals as before. "Answer here" on the table strip takes the prompt
  back from the phone and opens the modal on the desktop. "Roll for me" is the
  existing skipped-roll path, so the GM rolls it digitally.
- **A "Party Table" note** (`partyNote.ts`, `dm_instructions`, always on) is
  added to the story's notes the first time a party player is on the roster.
  It tells the GM to write each player a `Character: <name>` sheet, which is
  how a phone finds its sheet, and to name players in rolls and questions. The
  co-op setup note only exists for stories that started with several players.
  A note the author edited is left alone.
- **Party mode and an online room can't run together.** Opening a room closes
  the table, and the Menu says so. The two paths would otherwise both feed one
  story.
- **Only the desktop app has it.** `isStandalone() && isTauri()`; the Menu
  section is absent on the web build, the Android app and `tauri dev`.
- **The cooldown setting** (`partySpotlightCooldownMs`, 3–60 s, default 15 s)
  is read once and applies to the next steal. It is separate from couch
  mode's fixed 4 s.
- **No separate short code.** The URL is the fallback for a camera that won't
  scan, with a copy button. The token is 128 bits, which is too long to type;
  a short join code is a P3 idea.
- **Physical dice mode** still throws on the desktop's tray. Phones don't
  throw dice.
- **Changing the network** in the lobby's picker closes and reopens the table
  on the new address, which changes the token; phones rescan.

### 2026-10-21, S4/S5 (the phone page)

- **Size.** `/party` loads 12 script files, 1,982 KB raw (536 KB gzipped),
  against 4,038 KB for `/story`. Its own code is one 18 KB chunk. The rest is
  the app's shared layout (React, and an 883 KB icon set that the site header
  pulls in). On a home network that is a fraction of a second, and the
  static files are marked immutable so a second visit is cached. The Rust
  server doesn't compress. A separate root layout for `/party` would cut it
  to about React alone, but means moving every page into a route group, so
  it is left for P3 if it is ever felt.
- **S5 needed no change.** `/party?t=…` serves `party.html`, and the
  `/_next/static/...` assets load from the bundle with no `basePath`.
- **Seat storage on the phone** is one localStorage entry, tied to the table's
  token; a reopened table has a new token, so a stale seat is dropped and the
  phone shows the join form.
- **The page stays out of the way:** no `crypto.subtle`, `randomUUID`,
  clipboard or service worker; the site header hides on `/party`.
- **A bug the browser check caught:** the cooldown countdown counted from the
  page's load time, so a player who had never been interrupted was shown "You
  were interrupted. You can take it back in 1 s". Fixed before the first
  commit that included the page.

### 2026-10-21, the `engine-review` pass

The agent read the diff against the bug families this codebase keeps
producing. Triaged against correctness and the stated requirements; fixed in
`a49416f` unless noted.

- **Fixed: a removed player's pending roll or question hung the turn,** and
  closing the table answered such prompts as "skipped" without telling anyone.
  Both now hand the prompt back to the desktop's own modal, on the same
  promise (`onReturnRequest`); only leaving the story page, where there is
  nowhere to show it, still answers as skipped.
- **Fixed: the turn lock opened mid-turn.** The page's loading flag drops
  between a turn's stages when suggested choices are on, so a phone could Go
  into a turn still being observed. The host now stays "generating" until the
  submitted turn's promise settles, as well as while the page says so.
- **Fixed: undo on a solo story** (no roster at all) lost the party's seats
  from the GM's player list; the roster sync now treats "no roster" as empty
  and writes the claimed seats back.
- **Fixed: removing a player during a turn** was undone by the turn's own
  save, so the button is disabled while the GM works.
- **Fixed: two screens holding one seat kicked each other forever.** The
  desktop now sends `kicked`, and a phone that receives it does not
  reconnect until the player taps "Join again".
- **Fixed: the Party Table note** said to use `player_name` for
  `ask_for_roll`, a tool that exists only in manual dice mode; it now says so.
  Separately, on Gemini neither `ask_for_roll` nor `ask_question` is in
  `GOOGLE_ESSENTIAL_TOOLS`, so no prompt ever reaches a phone there; that adds
  to status report §6.14 and is not fixed here.
- **Fixed: a name could carry `:` or `>`** and fake another speaker inside
  its own turn line.
- **Fixed: a close that lands while the server is opening** left a table
  with no server. `start()` now claims its epoch first and takes a late server
  down.
- **Fixed: the server outlived a webview reload.** `Channel::send` still
  succeeds after a reload, so nothing told Rust the table was gone. The shell
  now stops the server on any full page load (`on_page_load`), which is the
  one event a client-side route change does not raise.
- **Fixed (nit): a phone that stops reading** could hold its connection
  open; sends now time out after 5 s.
- **Not changed: a sheet is found by its title** (`Character: <name>`), so a
  phone that joins under a name with no current seat receives that unowned
  sheet. Sheets are `always_reveal` and already shown to every player in the
  notes UI, so nothing secret is exposed; joining under a removed player's
  name getting their sheet back is the useful side of it.
- **Not changed (nits):** the 16-client cap is counted after the upgrade, so
  a burst of token holders can pass it; and the Party Table note stays in the
  story after the table closes (the author can delete it under Notes).

### 2026-10-22, the first real-phone run

The author ran the merged build's `app.exe` with one phone on the home Wi-Fi:
the QR opened the join form, joining showed a seat, the spotlight and a queued
line showed on the phone and on the desktop strip, and Go reached the desktop.
Windows Firewall asked once for `app.exe` and the author allowed Private
networks. Nothing needed changing. The table took port 8787 (nothing else held
it), and the lobby showed no network picker because this PC has one
home-network address (the Tailscale, Bluetooth and VPN-style addresses are
filtered out). The checks this did not reach stay in `pending_tests.md`.
